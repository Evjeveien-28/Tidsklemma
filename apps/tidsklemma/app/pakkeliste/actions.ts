"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../husstand/personer";
import { hentHusstand } from "../planter/data";
import { startAgent } from "../middag/agent/start";
import { hentAlltid, lesTing } from "./data";
import { finnStedITekst } from "./vaer";
import { agentKlar } from "../middag/agent/start";

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
  const personer = await hentPersoner(supabase, hid);
  const husstand = new Set(personer.map((p) => p.id));
  const tittel = tekst(fd, "tittel", 80) || "Tur";
  const beskrivelse = tekst(fd, "beskrivelse", 2000);
  // Står «Hvor» tomt, prøver vi å finne stedet i teksten («Hytta på Hafjell» → Hafjell), så været virker.
  const sted =
    tekst(fd, "sted", 120) ||
    ((await finnStedITekst(`${tittel}. ${beskrivelse}`, personer.map((p) => p.navn)).catch(() => null))?.navn ?? "");
  return {
    tittel,
    beskrivelse,
    sted,
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
  await leggTilAlltid(supabase, hid, data.id, felt.personer, true);
  // Agenten foreslår resten med en gang.
  await bestillAgent(db, hid, data.id);
  revalidatePath("/", "layout");
  redirect(`/pakkeliste/${data.id}`);
}

export async function endreTur(fd: FormData) {
  const id = String(fd.get("tur") ?? "");
  if (!erId(id)) redirect("/pakkeliste");
  const { supabase, db, hid } = await husstanden();
  const felt = await turFelt(fd, supabase, hid);
  if (!felt) redirect(`/pakkeliste/${id}/endre?feil=dato`);
  const { data: for_ } = await db.from("turer").select("personer").eq("id", id).maybeSingle();
  await db.from("turer").update(felt).eq("id", id);
  // De som er lagt til i turen, får det som alltid skal med.
  const nye = felt.personer.filter((p) => !((for_?.personer as string[] | undefined) ?? []).includes(p));
  if (nye.length) await leggTilAlltid(supabase, hid, id, nye, false);
  // Har man kommet på noe, ser agenten på listen på nytt. Ikke når listen er låst.
  if (fd.get("ny_runde") === "1") {
    const { data: tur } = await db.from("turer").select("laast_at").eq("id", id).maybeSingle();
    if (tur && !tur.laast_at) await bestillAgent(db, hid, id);
  }
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
  const ting = lesTing(String(fd.get("navn") ?? ""))
    .slice(0, 50)
    .map((t) => ({ tur_id: tur, household_id: hid, person_id: erId(person) ? person : null, ...t }));
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
  // Ellers hopper haken tilbake når den optimistiske visningen slutter.
  revalidatePath("/", "layout");
}

/** Fjern en ting. Den beholdes som fjernet, så agenten kan lære hva vi ikke vil ha med. */
export async function fjernTing(id: string) {
  if (!erId(id)) return;
  const { db } = await husstanden();
  await db.from("ting").update({ fjernet_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function endreTing(fd: FormData) {
  const id = String(fd.get("ting") ?? "");
  const tur = String(fd.get("tur") ?? "");
  const person = String(fd.get("person") ?? "");
  if (!erId(id) || !erId(tur)) redirect("/pakkeliste");
  const { db } = await husstanden();
  const navn = tekst(fd, "navn", 120);
  const antall = Math.min(Math.max(Math.round(Number(fd.get("antall")) || 1), 1), 99);
  // En ting man har endret selv, er ens egen: agenten fjerner den ikke i en ny runde.
  if (navn) await db.from("ting").update({ navn, antall, person_id: erId(person) ? person : null, kilde: "manuell" }).eq("id", id);
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

/**
 * Bestill forslag fra agenten. Den legger til det som mangler, og kan fjerne sine egne forslag som ikke passer lenger.
 * Det man har lagt til selv, det som alltid er med, og det som er pakket, røres ikke.
 * Hver kjøring bruker av Claude-kvoten: ikke en ny mens en er i gang, og høyst ti i døgnet per husstand.
 */
async function bestillAgent(db: ReturnType<Awaited<ReturnType<typeof createClient>>["schema"]>, hid: string, id: string): Promise<"ok" | "pagar" | "mange" | "av"> {
  if (!agentKlar()) return "av";
  const { data: turer } = await db
    .from("turer")
    .select("id, forslag_status, forslag_bestilt_at")
    .eq("household_id", hid)
    .gte("forslag_bestilt_at", new Date(Date.now() - 86_400_000).toISOString());
  const denne = (turer ?? []).find((t) => t.id === id);
  if (denne && (denne.forslag_status === "venter" || denne.forslag_status === "jobber") && Date.parse(denne.forslag_bestilt_at) > Date.now() - 15 * 60_000)
    return "pagar";
  if ((turer ?? []).length >= 10) return "mange";
  const { error } = await db
    .from("turer")
    .update({ forslag_status: "venter", forslag_bestilt_at: new Date().toISOString(), forslag_merknad: null })
    .eq("id", id);
  if (error) return "av";
  after(startAgent);
  return "ok";
}

/** Prøv igjen når agenten ikke fikk det til. */
export async function bestillForslag(fd: FormData) {
  const id = String(fd.get("tur") ?? "");
  if (!erId(id)) redirect("/pakkeliste");
  const { db, hid } = await husstanden();
  const svar = await bestillAgent(db, hid, id);
  revalidatePath("/", "layout");
  redirect(`/pakkeliste/${id}${svar === "mange" ? "?feil=mange" : ""}`);
}

/**
 * Legg det som alltid skal med på turen: for personene, og felles hvis `felles`. Det som allerede står der, hoppes over.
 */
async function leggTilAlltid(supabase: Awaited<ReturnType<typeof createClient>>, hid: string, tur: string, personer: string[], felles: boolean) {
  const alltid = (await hentAlltid(supabase, hid)).filter((a) => (a.person_id ? personer.includes(a.person_id) : felles));
  if (alltid.length === 0) return;
  const db = supabase.schema("pakkeliste");
  const { data: finnes } = await db.from("ting").select("person_id, navn").eq("tur_id", tur);
  const har = new Set((finnes ?? []).map((t) => `${t.person_id ?? ""}|${String(t.navn).toLowerCase()}`));
  const nye = alltid
    .filter((a) => !har.has(`${a.person_id ?? ""}|${a.navn.toLowerCase()}`))
    .map((a) => ({ tur_id: tur, household_id: hid, person_id: a.person_id, navn: a.navn, antall: a.antall, kilde: "alltid" }));
  if (nye.length) await db.from("ting").insert(nye);
}

/** Innstillingene: det som alltid skal med (per person og felles), og instruksjoner til agenten. */
export async function lagreInnstillinger(fd: FormData) {
  const { supabase, db, hid } = await husstanden();
  const personer = (await hentPersoner(supabase, hid)).map((p) => p.id);
  const rader = [null, ...personer].flatMap((p) =>
    lesTing(String(fd.get(`alltid_${p ?? "felles"}`) ?? "")).map((t) => ({ household_id: hid, person_id: p, ...t })),
  );
  const { error: e1 } = await db
    .from("innstillinger")
    .upsert({ household_id: hid, instruksjoner: tekst(fd, "instruksjoner", 2000), updated_at: new Date().toISOString() }, { onConflict: "household_id" });
  await db.from("alltid").delete().eq("household_id", hid);
  const { error: e2 } = rader.length ? await db.from("alltid").insert(rader) : { error: null };
  revalidatePath("/pakkeliste", "layout");
  redirect(`/pakkeliste/innstillinger?${e1 || e2 ? "feil=1" : "lagret=1"}`);
}
