"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentHusstand } from "../planter/data";
import { BUTIKKER } from "./butikker";
import { GRADER, HANDTERINGER, hentInnstillinger, lesMerkelapper } from "./data";
import { hentSide, lesOppskrift, sideTittel } from "./les-oppskrift";
import { hentPosisjon, hentTilbud } from "./tilbud-hent";

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
      min_besparelse: tall(fd, "min_besparelse", 0, 10000, 50),
      postnummer: gyldig ? postnummer : null,
      hverdag_minutter: tall(fd, "hverdag_minutter", 10, 240, 45),
      onsker: tekst(fd, "onsker", 1000),
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
