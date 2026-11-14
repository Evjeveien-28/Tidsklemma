"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentHusstand } from "../planter/data";
import { lesVarer } from "./les";
import { sokOda, type Produkt } from "./oda";

async function husstanden() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) redirect("/");
  return { db: supabase.schema("handleliste"), hid: husstand.id };
}

/** «melk, 2 brød» → to varer, hver med anslått pris fra Oda. */
export async function leggTil(fd: FormData) {
  const varer = lesVarer(String(fd.get("tekst") ?? ""));
  if (varer.length === 0) redirect("/handleliste");
  const { db, hid } = await husstanden();
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
  await db.from("varer").insert(funnet.map((v) => ({ household_id: hid, navn: v.navn, antall: v.antall, produkt: v.produkt })));
  revalidatePath("/", "layout");
  redirect("/handleliste");
}

/** Kryss av eller fjern krysset. Kalles fra listen uten å laste siden på nytt. */
export async function settAvkrysset(id: string, pa: boolean) {
  const { db } = await husstanden();
  await db.from("varer").update({ avkrysset_at: pa ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function fjernAvkryssede() {
  const { db, hid } = await husstanden();
  await db.from("varer").delete().eq("household_id", hid).not("avkrysset_at", "is", null);
  revalidatePath("/", "layout");
  redirect("/handleliste");
}

export async function lagreVare(fd: FormData) {
  const id = String(fd.get("vare") ?? "");
  const navn = String(fd.get("navn") ?? "").trim().slice(0, 120);
  const antall = Math.min(Math.max(Number(fd.get("antall")) || 1, 0.01), 999);
  const butikk = String(fd.get("butikk") ?? "") || null;
  if (!navn) redirect(`/handleliste/${id}?feil=navn`);
  const { db } = await husstanden();
  await db.from("varer").update({ navn, antall, butikk }).eq("id", id);
  revalidatePath("/", "layout");
  redirect("/handleliste");
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
  redirect("/handleliste");
}

export async function slettVare(fd: FormData) {
  const { db } = await husstanden();
  await db.from("varer").delete().eq("id", String(fd.get("vare") ?? ""));
  revalidatePath("/", "layout");
  redirect("/handleliste");
}
