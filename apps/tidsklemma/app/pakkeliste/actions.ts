"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../husstand/personer";
import { hentHusstand } from "../planter/data";

async function husstanden() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) redirect("/");
  return { supabase, db: supabase.schema("pakkeliste"), hid: husstand.id };
}

const tekst = (fd: FormData, felt: string, maks: number) => String(fd.get(felt) ?? "").trim().slice(0, maks);
const erDato = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const erId = (d: string) => /^[0-9a-f-]{36}$/.test(d);

/** Turens felt fra skjemaet. Personer må høre til husstanden. */
async function turFelt(fd: FormData, supabase: Awaited<ReturnType<typeof createClient>>, hid: string) {
  const fra = tekst(fd, "fra", 10);
  let til = tekst(fd, "til", 10);
  if (!erDato(fra)) return null;
  if (!erDato(til) || til < fra) til = fra;
  const husstand = new Set((await hentPersoner(supabase, hid)).map((p) => p.id));
  return {
    tittel: tekst(fd, "tittel", 80) || "Tur",
    beskrivelse: tekst(fd, "beskrivelse", 2000),
    sted: tekst(fd, "sted", 120),
    fra,
    til,
    personer: fd.getAll("person").map(String).filter((p) => husstand.has(p)),
  };
}

export async function nyTur(fd: FormData) {
  const { supabase, db, hid } = await husstanden();
  const felt = await turFelt(fd, supabase, hid);
  if (!felt) redirect("/pakkeliste/ny?feil=dato");
  const { data, error } = await db.from("turer").insert({ household_id: hid, ...felt }).select("id").single();
  if (error || !data) redirect("/pakkeliste/ny?feil=lagre");
  revalidatePath("/", "layout");
  redirect(`/pakkeliste/${data.id}`);
}

export async function endreTur(fd: FormData) {
  const id = String(fd.get("tur") ?? "");
  if (!erId(id)) redirect("/pakkeliste");
  const { supabase, db, hid } = await husstanden();
  const felt = await turFelt(fd, supabase, hid);
  if (!felt) redirect(`/pakkeliste/${id}/endre?feil=dato`);
  await db.from("turer").update(felt).eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/pakkeliste/${id}`);
}

export async function slettTur(fd: FormData) {
  const id = String(fd.get("tur") ?? "");
  const { db } = await husstanden();
  if (erId(id)) await db.from("turer").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/pakkeliste");
}

/** Legg til ting. Flere på én gang med komma eller linjeskift: «ullundertøy, 3 sokker». */
export async function leggTil(fd: FormData) {
  const tur = String(fd.get("tur") ?? "");
  const person = String(fd.get("person") ?? "");
  if (!erId(tur)) redirect("/pakkeliste");
  const { db, hid } = await husstanden();
  const ting = String(fd.get("navn") ?? "")
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((t) => {
      // «3 sokker» eller «sokker x3» gir antall 3.
      const m = t.match(/^(\d{1,2})\s+(.+)$/) ?? t.match(/^(.+?)\s*[x×]\s*(\d{1,2})$/i);
      const [navn, antall] = m ? (/^\d/.test(m[1]!) ? [m[2]!, Number(m[1])] : [m[1]!, Number(m[2])]) : [t, 1];
      return { tur_id: tur, household_id: hid, person_id: erId(person) ? person : null, navn: navn.slice(0, 120), antall: Math.min(Math.max(antall, 1), 99) };
    });
  if (ting.length) await db.from("ting").insert(ting);
  revalidatePath(`/pakkeliste/${tur}`);
  redirect(`/pakkeliste/${tur}#${erId(person) ? person : "felles"}`);
}

/** Pakket eller ikke. Kalles fra listen, uten å laste siden på nytt. */
export async function settPakket(id: string, pa: boolean) {
  if (!erId(id)) return;
  const { supabase, db } = await husstanden();
  const { data: meg } = await supabase.auth.getClaims();
  await db
    .from("ting")
    .update(pa ? { pakket_at: new Date().toISOString(), pakket_av: meg?.claims.sub ?? null } : { pakket_at: null, pakket_av: null })
    .eq("id", id);
}

/** Fjern en ting. Den beholdes som fjernet, så agenten kan lære hva vi ikke vil ha med. */
export async function fjernTing(id: string) {
  if (!erId(id)) return;
  const { db } = await husstanden();
  await db.from("ting").update({ fjernet_at: new Date().toISOString() }).eq("id", id);
}

export async function endreTing(fd: FormData) {
  const id = String(fd.get("ting") ?? "");
  const tur = String(fd.get("tur") ?? "");
  const person = String(fd.get("person") ?? "");
  if (!erId(id) || !erId(tur)) redirect("/pakkeliste");
  const { db } = await husstanden();
  const navn = tekst(fd, "navn", 120);
  const antall = Math.min(Math.max(Math.round(Number(fd.get("antall")) || 1), 1), 99);
  if (navn) await db.from("ting").update({ navn, antall, person_id: erId(person) ? person : null }).eq("id", id);
  revalidatePath(`/pakkeliste/${tur}`);
  redirect(`/pakkeliste/${tur}`);
}

/** Lås: listen er slik vi vil ha den. Agenten bruker låste lister når den foreslår nye. */
export async function lasTur(fd: FormData) {
  const id = String(fd.get("tur") ?? "");
  const pa = fd.get("pa") === "1";
  if (!erId(id)) redirect("/pakkeliste");
  const { db } = await husstanden();
  await db.from("turer").update({ laast_at: pa ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath(`/pakkeliste/${id}`);
  redirect(`/pakkeliste/${id}`);
}

/** Nullstill avkrysningene, f.eks. før hjemreisen. */
export async function nullstillPakket(fd: FormData) {
  const id = String(fd.get("tur") ?? "");
  if (!erId(id)) redirect("/pakkeliste");
  const { db } = await husstanden();
  await db.from("ting").update({ pakket_at: null, pakket_av: null }).eq("tur_id", id);
  revalidatePath(`/pakkeliste/${id}`);
  redirect(`/pakkeliste/${id}`);
}
