"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentHusstand } from "../planter/data";
import { BUTIKKER } from "./butikker";
import { sokOda } from "../handleliste/oda";
import { hentPersoner } from "../husstand/personer";
import { GRADER, HANDTERINGER, hentInnstillinger, hentMeny, lesBasisvarer, lesMerkelapper } from "./data";
import { valgteInnkjop, valgteRetter, type Valg } from "./meny";
import { prisHos, prisoversikt } from "./pris";
import { hentSide, lesOppskrift, sideTittel } from "./les-oppskrift";
import { hentPosisjon, hentTilbud } from "./tilbud-hent";
import { startAgent } from "./agent/start";
import { iDag, leggTilDager } from "../dato";
import { mandagI } from "./uke";

type Klient = Awaited<ReturnType<typeof createClient>>;

async function husstanden() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) redirect("/");
  return { supabase, db: supabase.schema("middag"), hid: husstand.id };
}

const tekst = (fd: FormData, felt: string, maks: number) => String(fd.get(felt) ?? "").trim().slice(0, maks);
const tall = (fd: FormData, felt: string, min: number, maks: number, standard: number) => {
  const n = Number(fd.get(felt));
  return Number.isFinite(n) ? Math.min(maks, Math.max(min, Math.round(n))) : standard;
};

const TIL_INNSTILLINGER = "/middag/innstillinger";

export async function lagreInnstillinger(fd: FormData) {
  const { db, hid } = await husstanden();
  const dager = fd.getAll("dag").map(Number).filter((d) => d >= 1 && d <= 7);
  const postnummer = tekst(fd, "postnummer", 4);
  const gyldig = /^\d{4}$/.test(postnummer);
  const { data: forrige } = await db.from("innstillinger").select("postnummer, lat").eq("household_id", hid).maybeSingle();
  // Slå opp posisjonen bare når postnummeret er nytt, eller ikke er slått opp før.
  const posisjon =
    gyldig && (forrige?.postnummer !== postnummer || forrige?.lat == null)
      ? await hentPosisjon(postnummer)
      : undefined;
  const { error } = await db.from("innstillinger").upsert(
    {
      ...(posisjon !== undefined || !gyldig
        ? { sted: posisjon?.sted ?? null, lat: posisjon?.lat ?? null, lng: posisjon?.lng ?? null }
        : {}),
      household_id: hid,
      dager: dager.length ? dager : [1, 2, 3, 4, 5, 6, 7],
      maks_butikker: tall(fd, "maks_butikker", 1, 3, 1),
      postnummer: gyldig ? postnummer : null,
      hverdag_minutter: tall(fd, "hverdag_minutter", 10, 240, 45),
      onsker: tekst(fd, "onsker", 1000),
      basisvarer: lesBasisvarer(String(fd.get("basisvarer") ?? "")),
      aktiv: fd.get("aktiv") === "1",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "household_id" },
  );
  revalidatePath("/middag", "layout");
  redirect(`${TIL_INNSTILLINGER}?${error ? "feil=1" : "lagret=1"}`);
}

/** Legg til, flytt opp/ned eller fjern en butikk i den prioriterte listen. */
export async function endreButikker(fd: FormData) {
  const { supabase, db, hid } = await husstanden();
  const kode = String(fd.get("kode") ?? "");
  const hva = String(fd.get("hva") ?? "");
  if (!BUTIKKER.some((b) => b.kode === kode)) redirect(TIL_INNSTILLINGER);
  const liste = [...(await hentInnstillinger(supabase, hid)).butikker];
  const i = liste.indexOf(kode);
  if (hva === "legg-til" && i < 0) liste.push(kode);
  if (hva === "fjern" && i >= 0 && liste.length > 1) liste.splice(i, 1);
  if ((hva === "opp" && i > 0) || (hva === "ned" && i >= 0 && i < liste.length - 1)) {
    const j = hva === "opp" ? i - 1 : i + 1;
    [liste[i], liste[j]] = [liste[j]!, liste[i]!];
  }
  await db.from("innstillinger").upsert({ household_id: hid, butikker: liste, updated_at: new Date().toISOString() }, { onConflict: "household_id" });
  revalidatePath("/middag", "layout");
  redirect(`${TIL_INNSTILLINGER}#butikker`);
}

/** Ny rekkefølge etter at butikkene er dratt rundt. Må være de samme butikkene som før. */
export async function sorterButikker(koder: string[]) {
  const { supabase, db, hid } = await husstanden();
  const forrige = (await hentInnstillinger(supabase, hid)).butikker;
  if (koder.length !== forrige.length || !koder.every((k) => forrige.includes(k))) return false;
  const { error } = await db.from("innstillinger").upsert({ household_id: hid, butikker: koder, updated_at: new Date().toISOString() }, { onConflict: "household_id" });
  revalidatePath("/middag", "layout");
  return !error;
}

export async function leggTilAllergi(fd: FormData) {
  const { db, hid } = await husstanden();
  const navn = tekst(fd, "navn", 60);
  const grad = String(fd.get("grad"));
  const handtering = String(fd.get("handtering"));
  const person = String(fd.get("person") ?? "");
  if (!navn || !GRADER.some((g) => g.verdi === grad) || !HANDTERINGER.some((h) => h.verdi === handtering)) redirect(`${TIL_INNSTILLINGER}?feil=allergi#allergier`);
  const { error } = await db.from("allergier").insert({
    household_id: hid,
    navn,
    grad,
    handtering,
    person_id: /^[0-9a-f-]{36}$/.test(person) ? person : null,
    erstatning: tekst(fd, "erstatning", 300),
  });
  revalidatePath(TIL_INNSTILLINGER);
  redirect(`${TIL_INNSTILLINGER}${error ? "?feil=allergi" : ""}#allergier`);
}

export async function fjernAllergi(fd: FormData) {
  const { db } = await husstanden();
  await db.from("allergier").delete().eq("id", String(fd.get("allergi") ?? ""));
  revalidatePath(TIL_INNSTILLINGER);
  redirect(`${TIL_INNSTILLINGER}#allergier`);
}

function gyldigLenke(tekst: string): string | null {
  try {
    const u = new URL(tekst.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Lim inn en lenke: oppskriften leses fra siden. Klarer vi det ikke, lagres lenken, og agenten fyller inn senere. */
export async function leggTilFraLenke(fd: FormData) {
  const rå = tekst(fd, "lenke", 2000);
  const lenke = gyldigLenke(rå);
  if (!lenke) redirect(`/middag/oppskrifter/ny?feil=lenke&lenke=${encodeURIComponent(rå)}`);
  const { db, hid } = await husstanden();

  const { data: finnes } = await db.from("oppskrifter").select("id").eq("household_id", hid).eq("lenke", lenke).maybeSingle();
  if (finnes) redirect(`/middag/oppskrifter/${finnes.id}`);

  const html = await hentSide(lenke);
  const lest = html ? lesOppskrift(html, lenke) : null;
  const navn = lest?.navn ?? (html && sideTittel(html)) ?? new URL(lenke).hostname.replace(/^www\./, "");
  const { data, error } = await db
    .from("oppskrifter")
    .insert({
      household_id: hid,
      navn: navn.slice(0, 200),
      lenke,
      ingredienser: lest?.ingredienser.slice(0, 100) ?? [],
      fremgangsmaate: lest?.fremgangsmaate.slice(0, 20000) ?? "",
      minutter: lest?.minutter && lest.minutter <= 1440 ? lest.minutter : null,
      porsjoner: lest?.porsjoner && lest.porsjoner <= 100 ? lest.porsjoner : null,
      bilde_url: lest?.bilde ?? null,
      trenger_utfylling: !lest || lest.ingredienser.length === 0,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/middag/oppskrifter/ny?feil=lagre&lenke=${encodeURIComponent(rå)}`);
  // Klarte vi ikke å lese den, prøver agenten med teksten på siden.
  if (!lest || lest.ingredienser.length === 0) after(startAgent);
  revalidatePath("/middag", "layout");
  redirect(`/middag/oppskrifter/${data.id}?${lest ? "lest=1" : "ulest=1"}`);
}

/** Ny oppskrift skrevet inn for hånd, eller endring av en som finnes. */
export async function lagreOppskrift(fd: FormData) {
  const id = String(fd.get("oppskrift") ?? "");
  const navn = tekst(fd, "navn", 200);
  const tilbake = id ? `/middag/oppskrifter/${id}/endre` : "/middag/oppskrifter/ny?manuell=1";
  if (!navn) redirect(`${tilbake}${id ? "?" : "&"}feil=navn`);
  const lenke = gyldigLenke(tekst(fd, "lenke", 2000));
  const ingredienser = String(fd.get("ingredienser") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 100);
  const min = Number(fd.get("minutter"));
  const pors = Number(fd.get("porsjoner"));
  const verdier = {
    navn,
    lenke,
    ingredienser,
    fremgangsmaate: tekst(fd, "fremgangsmaate", 20000),
    minutter: min >= 1 && min <= 1440 ? Math.round(min) : null,
    porsjoner: pors >= 1 && pors <= 100 ? Math.round(pors) : null,
    merkelapper: lesMerkelapper(tekst(fd, "merkelapper", 400)),
    favoritt: fd.get("favoritt") === "1",
    trygg: fd.get("trygg") === "1",
    // Har den fått ingredienser, trenger ikke agenten fylle inn.
    trenger_utfylling: ingredienser.length === 0 && Boolean(lenke),
    updated_at: new Date().toISOString(),
  };
  const { db, hid } = await husstanden();
  const svar = id
    ? await db.from("oppskrifter").update(verdier).eq("id", id).select("id").single()
    : await db.from("oppskrifter").insert({ household_id: hid, ...verdier }).select("id").single();
  if (svar.error || !svar.data) redirect(`${tilbake}${id ? "?" : "&"}feil=lagre`);
  revalidatePath("/middag", "layout");
  redirect(`/middag/oppskrifter/${svar.data.id}`);
}

export async function settFavoritt(fd: FormData) {
  const id = String(fd.get("oppskrift") ?? "");
  const { db } = await husstanden();
  await db.from("oppskrifter").update({ favoritt: fd.get("pa") === "1" }).eq("id", id);
  revalidatePath("/middag", "layout");
  redirect(String(fd.get("tilbake") ?? "") === "liste" ? "/middag/oppskrifter" : `/middag/oppskrifter/${id}`);
}

export async function slettOppskrift(fd: FormData) {
  const { db } = await husstanden();
  await db.from("oppskrifter").delete().eq("id", String(fd.get("oppskrift") ?? ""));
  revalidatePath("/middag", "layout");
  redirect("/middag/oppskrifter");
}

/** Henter ukens tilbud nå, i stedet for å vente til natten. */
export async function hentTilbudNa() {
  const { db, hid } = await husstanden();
  const { data } = await db.from("innstillinger").select("butikker, lat, lng").eq("household_id", hid).maybeSingle();
  if (!data?.lat || !data.lng) redirect("/middag/tilbud?feil=sted");
  const tilbud = await hentTilbud(data.butikker as string[], data.lat as number, data.lng as number);
  if (tilbud.length === 0) redirect("/middag/tilbud?feil=tomt");
  await db.from("tilbud").delete().eq("household_id", hid);
  for (let i = 0; i < tilbud.length; i += 500) {
    const { error } = await db.from("tilbud").insert(tilbud.slice(i, i + 500).map((t) => ({ household_id: hid, ...t })));
    if (error) redirect("/middag/tilbud?feil=lagre");
  }
  revalidatePath("/middag", "layout");
  redirect("/middag/tilbud");
}

// ——— Meny ———

const erDato = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Bestill en meny for uka. Hver dag: egen oppskrift eller «la menyen foreslå», hvem som er med, og gjester. */
export async function bestill(fd: FormData) {
  const uke = String(fd.get("uke") ?? "");
  const denne = mandagI(iDag());
  if (uke !== denne && uke !== leggTilDager(denne, 7)) redirect("/middag");
  const { supabase, db, hid } = await husstanden();
  // Hver bestilling starter agenten, som bruker av kvoten. Vent på den som er i gang, og ikke mer enn ti i døgnet.
  const { data: nylige } = await db
    .from("bestillinger")
    .select("uke_start, status, created_at")
    .eq("household_id", hid)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const pagaende = (nylige ?? []).some((b) => b.uke_start === uke && (b.status === "venter" || b.status === "jobber") && Date.parse(b.created_at) > Date.now() - 15 * 60_000);
  if (pagaende) redirect(`/middag?uke=${uke}`);
  if ((nylige ?? []).length >= 10) redirect(`/middag/planlegg?uke=${uke}&feil=mange`);
  const alle = (await hentPersoner(supabase, hid)).map((p) => p.id);
  const dager = fd
    .getAll("dato")
    .map(String)
    .filter(erDato)
    .map((dato) => {
      const med = fd.getAll(`med_${dato}`).map(String);
      const oppskrift = String(fd.get(`oppskrift_${dato}`) ?? "");
      return {
        dato,
        ...(oppskrift === "fri" && { fri: true }),
        oppskrift_id: /^[0-9a-f-]{36}$/.test(oppskrift) ? oppskrift : null,
        borte: alle.filter((p) => !med.includes(p)),
        gjester: Math.min(Math.max(Math.round(Number(fd.get(`gjester_${dato}`)) || 0), 0), 30),
      };
    });
  if (dager.length === 0) redirect(`/middag/planlegg?uke=${uke}&feil=dager`);
  const { error } = await db.from("bestillinger").insert({ household_id: hid, uke_start: uke, dager });
  // Start agenten etter at svaret er sendt, så knappen ikke venter på claude.ai.
  if (!error) after(startAgent);
  revalidatePath("/middag", "layout");
  redirect(error ? `/middag/planlegg?uke=${uke}&feil=lagre` : `/middag?uke=${uke}`);
}

async function endreValg(uke: string, endre: (v: Valg) => Valg) {
  const { supabase, db, hid } = await husstanden();
  const { data } = await db.from("menyer").select("valg").eq("household_id", hid).eq("uke_start", uke).maybeSingle();
  if (!data) return;
  await db.from("menyer").update({ valg: endre((data.valg ?? {}) as Valg) }).eq("household_id", hid).eq("uke_start", uke);
  // Er uka sendt til Handleliste, følger den med på endringen.
  if (await erSendt(supabase, hid, uke)) await synkHandleliste(supabase, hid, uke);
  revalidatePath("/", "layout");
}

/** Velg et av alternativene, eller en egen oppskrift, for en dag. */
export async function velgRett(fd: FormData) {
  const uke = String(fd.get("uke") ?? "");
  const dato = String(fd.get("dato") ?? "");
  const valg = String(fd.get("valg") ?? "");
  const egen = String(fd.get("egen") ?? "");
  if (!erDato(uke) || !erDato(dato)) redirect("/middag");
  if (valg === "egen" && !/^[0-9a-f-]{36}$/.test(egen)) redirect(`/middag?uke=${uke}#${dato}`);
  if (valg !== "egen" && valg !== "fri" && !/^alt:[0-2]$/.test(valg)) redirect(`/middag?uke=${uke}#${dato}`);
  await endreValg(uke, (v) => ({
    ...v,
    dager: { ...v.dager, [dato]: valg === "fri" ? { fri: true } : valg.startsWith("alt:") ? { alt: Number(valg.slice(4)) } : { oppskrift_id: egen } },
  }));
  redirect(`/middag?uke=${uke}#${dato}`);
}

/** Varer vi har hjemme, tas ut av middagshandlelisten. */
export async function settHjemme(fd: FormData) {
  const uke = String(fd.get("uke") ?? "");
  const id = String(fd.get("innkjop") ?? "");
  const pa = fd.get("pa") === "1";
  if (!erDato(uke)) redirect("/middag");
  // «Trenger likevel» på en rest fra forrige uke må huskes, ellers havner den under «Har hjemme» igjen.
  await endreValg(uke, (v) => ({
    ...v,
    har: pa ? [...new Set([...(v.har ?? []), id])] : (v.har ?? []).filter((x) => x !== id),
    trenger: pa ? (v.trenger ?? []).filter((x) => x !== id) : [...new Set([...(v.trenger ?? []), id])],
  }));
  redirect(`/middag/handleliste?uke=${uke}`);
}

export async function velgFordeling(fd: FormData) {
  const uke = String(fd.get("uke") ?? "");
  const butikker = String(fd.get("butikker") ?? "").split(",").filter(Boolean).slice(0, 3);
  if (!erDato(uke)) redirect("/middag");
  await endreValg(uke, (v) => ({ ...v, fordeling: butikker }));
  redirect(`/middag/handleliste?uke=${uke}`);
}

/**
 * Sender middagsvarene til Handleliste, med butikk etter valgt fordeling. Middagsvarer fra samme uke som ikke er
 * krysset av, byttes ut, så man kan sende på nytt etter å ha endret menyen. Egne oppskrifter får ingrediensene sine
 * som vanlige varer, med pris anslått fra Oda.
 */
export async function sendTilHandleliste(fd: FormData) {
  const uke = String(fd.get("uke") ?? "");
  if (!erDato(uke)) redirect("/middag");
  const { supabase, hid } = await husstanden();
  const { error } = await synkHandleliste(supabase, hid, uke);
  revalidatePath("/", "layout");
  redirect(error ? `/middag/handleliste?uke=${uke}&feil=send` : "/handleliste");
}

/** Er middagsvarene for uka sendt til Handleliste? Da holdes de oppdatert når menyen endres. */
async function erSendt(supabase: Klient, hid: string, uke: string): Promise<boolean> {
  const { count } = await supabase
    .schema("handleliste")
    .from("varer")
    .select("id", { count: "exact", head: true })
    .eq("household_id", hid)
    .eq("kilde", "middag")
    .eq("kilde_uke", uke);
  return (count ?? 0) > 0;
}

/**
 * Legger innkjøpene for de valgte rettene i Handleliste, med butikk. Middagsvarene for uka som ikke er kjøpt ennå,
 * byttes ut, så listen følger menyen. Det som allerede er krysset av som kjøpt, legges ikke til en gang til.
 * Egne oppskrifter får ingrediensene sine som vanlige varer, med pris anslått fra Oda.
 */
async function synkHandleliste(supabase: Klient, hid: string, uke: string): Promise<{ error: unknown }> {
  const db = supabase.schema("middag");
  const meny = await hentMeny(supabase, hid, uke);
  if (!meny) return { error: "ingen meny" };
  const inn = await hentInnstillinger(supabase, hid);
  const innkjop = valgteInnkjop(meny);
  const { aktiv } = prisoversikt(innkjop, inn.butikker, inn.maks_butikker, meny.valg.fordeling);
  const fordeling = aktiv?.butikker ?? inn.butikker.slice(0, 1);
  const plassering = aktiv?.plassering ?? {};

  const rader: Record<string, unknown>[] = innkjop.map((i) => {
    const butikk = plassering[i.id] ?? fordeling[0]!;
    const p = prisHos(i, butikk);
    return {
      household_id: hid,
      navn: i.navn.slice(0, 120),
      antall: 1,
      butikk,
      produkt: p.pris != null ? { id: 0, navn: i.priser[butikk]?.vare ?? i.navn, ekstra: i.bruk ?? "", pris: p.pris, kilopris: null, enhet: null, bilde: null, tilbud: p.tilbud ? "Tilbud" : null } : null,
      kilde: "middag",
      kilde_uke: uke,
    };
  });
  // Egne oppskrifter: ingrediensene som de står, med pris fra Oda.
  const egne = valgteRetter(meny).filter((r) => r.type === "egen").map((r) => (r.type === "egen" ? r.oppskrift_id : ""));
  if (egne.length) {
    const { data: oppskrifter } = await db.from("oppskrifter").select("id, ingredienser").in("id", egne);
    const linjer = (oppskrifter ?? []).flatMap((o) => o.ingredienser as string[]).slice(0, 60);
    const funnet = await Promise.all(linjer.map((l) => sokOda(l.replace(/^[\d.,/\s]+(g|kg|dl|l|ss|ts|stk\.?|pk\.?|boks|ml)?\s+/i, ""), 1)));
    linjer.forEach((l, n) =>
      rader.push({ household_id: hid, navn: l.slice(0, 120), antall: 1, butikk: fordeling[0] ?? null, produkt: funnet[n]![0] ?? null, kilde: "middag", kilde_uke: uke }),
    );
  }

  const hl = supabase.schema("handleliste");
  const { data: kjopt } = await hl.from("varer").select("navn").eq("household_id", hid).eq("kilde", "middag").eq("kilde_uke", uke).not("avkrysset_at", "is", null);
  const kjopteNavn = new Set((kjopt ?? []).map((v) => String(v.navn).toLowerCase()));
  await hl.from("varer").delete().eq("household_id", hid).eq("kilde", "middag").eq("kilde_uke", uke).is("avkrysset_at", null);
  const nye = rader.filter((r) => !kjopteNavn.has(String(r.navn).toLowerCase()));
  const { error } = nye.length ? await hl.from("varer").insert(nye) : { error: null };
  return { error };
}

/** Menyen lar vente på seg: start agenten igjen. Bestillingen er den samme. */
export async function startPaNytt(fd: FormData) {
  const uke = String(fd.get("uke") ?? "");
  const { db, hid } = await husstanden();
  // Bare når en bestilling har ventet en stund, så knappen ikke kan brukes til å starte agenten om og om igjen.
  const { data } = await db
    .from("bestillinger")
    .select("id")
    .eq("household_id", hid)
    .eq("status", "venter")
    .lt("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .limit(1);
  if (data?.length) await startAgent();
  redirect(`/middag${erDato(uke) ? `?uke=${uke}` : ""}`);
}
