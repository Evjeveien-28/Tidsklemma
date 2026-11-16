"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentHusstand } from "../planter/data";
import { flyttFraHandleliste } from "../middag/actions";
import { listeSti } from "./data";
import { lesVarer } from "./les";
import { sokOda, type Produkt } from "./oda";

async function husstanden() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) redirect("/");
  return { db: supabase.schema("handleliste"), hid: husstand.id };
}

/** Liste-id fra skjemaet, eller null for matlisten. */
function listeFra(fd: FormData): string | null {
  const id = String(fd.get("liste") ?? "");
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

/** Listen en vare står på, så vi kan gå tilbake dit. */
async function varensListe(db: Awaited<ReturnType<typeof husstanden>>["db"], id: string): Promise<string | null> {
  const { data } = await db.from("varer").select("liste_id").eq("id", id).maybeSingle();
  return (data?.liste_id as string | null) ?? null;
}

/** Lag en ny liste, f.eks. «Jul», og gå til den. */
export async function nyListe(fd: FormData) {
  const navn = String(fd.get("navn") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!navn) redirect("/handleliste");
  const { db, hid } = await husstanden();
  const { data } = await db.from("lister").insert({ household_id: hid, navn }).select("id").single();
  revalidatePath("/", "layout");
  redirect(listeSti(data?.id as string | undefined));
}

/** Gi en egen liste nytt navn. Matlisten heter alltid «Mat». */
export async function endreListenavn(fd: FormData) {
  const liste = listeFra(fd);
  const navn = String(fd.get("navn") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (liste && navn) {
    const { db } = await husstanden();
    await db.from("lister").update({ navn }).eq("id", liste);
  }
  revalidatePath("/", "layout");
  redirect(listeSti(liste));
}

/** Slett en egen liste med alle varene på den. Matlisten kan ikke slettes. */
export async function slettListe(fd: FormData) {
  const liste = listeFra(fd);
  if (liste) {
    const { db } = await husstanden();
    await db.from("lister").delete().eq("id", liste);
  }
  revalidatePath("/", "layout");
  redirect("/handleliste");
}

/**
 * «melk, 2 brød» → to varer. På matlisten får hver vare anslått pris fra Oda; på andre lister (f.eks. «Jul»)
 * er det ikke mat, så der slår vi ikke opp pris. Er en butikk valgt, havner alle på den.
 */
export async function leggTil(fd: FormData) {
  const varer = lesVarer(String(fd.get("tekst") ?? ""));
  const liste = listeFra(fd);
  // Kjedene lagres med koden (KIWI), andre butikker med navnet slik det er skrevet («Clas Ohlson»).
  const valgt = String(fd.get("butikk") ?? "").trim();
  const ny = valgt === "__ny__" ? String(fd.get("ny_butikk") ?? "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  const iButikk = ny || (valgt && valgt !== "__ny__" ? valgt.slice(0, 40) : null);
  if (varer.length === 0) redirect(listeSti(liste));
  const { db, hid } = await husstanden();
  if (liste) {
    await db.from("varer").insert(
      varer.map((v) => ({ household_id: hid, liste_id: liste, navn: v.navn, antall: v.antall, produkt: null, uten_pris: true, butikk: iButikk })),
    );
    revalidatePath("/", "layout");
    redirect(listeSti(liste));
  }
  const funnet = await Promise.all(
    varer.map(async (v) => {
      // «12 egg» er som regel én pakning med 12, ikke 12 pakninger. Stemmer tallet med pakningen, blir det én.
      if (v.antall > 1) {
        const [hel] = await sokOda(v.tekst, 1);
        if (hel && new RegExp(`(^|[\\s,(])${v.antall}\\s*(stk|pk|pakk)\\b`, "i").test(`${hel.navn} ${hel.ekstra}`)) return { ...v, navn: v.tekst, antall: 1, produkt: hel };
      }
      const [produkt] = await sokOda(v.navn, 1);
      return { ...v, produkt: produkt ?? null };
    }),
  );
  await db.from("varer").insert(funnet.map((v) => ({ household_id: hid, navn: v.navn, antall: v.antall, produkt: v.produkt, butikk: iButikk })));
  revalidatePath("/", "layout");
  redirect(listeSti(null));
}

/** Kryss av eller fjern krysset. Kalles fra listen uten å laste siden på nytt. */
export async function settAvkrysset(id: string, pa: boolean) {
  const { db } = await husstanden();
  await db.from("varer").update({ avkrysset_at: pa ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function fjernAvkryssede(fd: FormData) {
  const liste = listeFra(fd);
  const { db, hid } = await husstanden();
  const sporring = db.from("varer").delete().eq("household_id", hid).not("avkrysset_at", "is", null);
  await (liste ? sporring.eq("liste_id", liste) : sporring.is("liste_id", null));
  revalidatePath("/", "layout");
  redirect(listeSti(liste));
}

export async function lagreVare(fd: FormData) {
  const id = String(fd.get("vare") ?? "");
  const navn = String(fd.get("navn") ?? "").trim().slice(0, 120);
  const antall = Math.min(Math.max(Number(fd.get("antall")) || 1, 0.01), 999);
  const butikk = String(fd.get("butikk") ?? "") || null;
  if (!navn) redirect(`/handleliste/${id}?feil=navn`);
  const { db } = await husstanden();
  const { data: for_ } = await db.from("varer").select("butikk, kilde, kilde_uke, produkt").eq("id", id).maybeSingle();
  await db.from("varer").update({ navn, antall, butikk }).eq("id", id);
  // En middagsvare som flyttes, flyttes i ukesmenyen også. Ellers flytter Middag den tilbake neste gang listen oppdateres.
  const innkjop = (for_?.produkt as Produkt | null)?.middag?.innkjop;
  if (for_?.kilde === "middag" && for_.kilde_uke && innkjop && butikk && butikk !== for_.butikk) {
    await flyttFraHandleliste(String(for_.kilde_uke), innkjop, butikk);
  }
  revalidatePath("/", "layout");
  redirect(listeSti(await varensListe(db, id)));
}

/** Velg hvilken vare hos Oda prisen skal anslås fra, eller ingen pris. */
export async function velgProdukt(fd: FormData) {
  const id = String(fd.get("vare") ?? "");
  const valg = String(fd.get("produkt") ?? "");
  const { db } = await husstanden();
  if (valg === "ingen") {
    await db.from("varer").update({ uten_pris: true }).eq("id", id);
  } else {
    const produkt = JSON.parse(valg) as Produkt;
    await db.from("varer").update({ produkt, uten_pris: false }).eq("id", id);
  }
  revalidatePath("/", "layout");
  redirect(listeSti(await varensListe(db, id)));
}

/** Fjern en vare. Kalles fra listen (sveip til siden) uten å laste siden på nytt. */
export async function fjernVare(id: string) {
  const { db } = await husstanden();
  await db.from("varer").delete().eq("id", id);
  revalidatePath("/", "layout");
}

export async function slettVare(fd: FormData) {
  const { db } = await husstanden();
  const id = String(fd.get("vare") ?? "");
  const liste = await varensListe(db, id);
  await db.from("varer").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(listeSti(liste));
}
