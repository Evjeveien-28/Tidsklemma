import type { createClient } from "@hjem/db/server";

type Klient = Awaited<ReturnType<typeof createClient>>;

export type Tur = {
  id: string;
  household_id: string;
  tittel: string;
  beskrivelse: string;
  sted: string;
  fra: string;
  til: string;
  personer: string[];
  laast_at: string | null;
  created_at: string;
  forslag_status: "venter" | "jobber" | "ferdig" | "feil" | null;
  forslag_bestilt_at: string | null;
  forslag_merknad: string | null;
};

export type Ting = {
  id: string;
  tur_id: string;
  person_id: string | null;
  navn: string;
  antall: number;
  kilde: "manuell" | "agent";
  pakket_at: string | null;
  fjernet_at: string | null;
  created_at: string;
};

const TURFELT = "id, household_id, tittel, beskrivelse, sted, fra, til, personer, laast_at, created_at, forslag_status, forslag_bestilt_at, forslag_merknad";
const TINGFELT = "id, tur_id, person_id, navn, antall, kilde, pakket_at, fjernet_at, created_at";

export async function hentTurer(supabase: Klient, husstand: string): Promise<Tur[]> {
  const { data, error } = await supabase.schema("pakkeliste").from("turer").select(TURFELT).eq("household_id", husstand).order("fra");
  if (error) throw new Error(error.message);
  return (data ?? []) as Tur[];
}

export async function hentTur(supabase: Klient, id: string): Promise<Tur | null> {
  const { data } = await supabase.schema("pakkeliste").from("turer").select(TURFELT).eq("id", id).maybeSingle();
  return (data as Tur | null) ?? null;
}

/** Tingene på en tur, uten de som er fjernet. */
export async function hentTing(supabase: Klient, tur: string): Promise<Ting[]> {
  const { data, error } = await supabase
    .schema("pakkeliste")
    .from("ting")
    .select(TINGFELT)
    .eq("tur_id", tur)
    .is("fjernet_at", null)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Ting[];
}

/** Hvor mange ting som er pakket, per tur. Til oversikten og flisen på startsiden. */
export async function hentFremdrift(supabase: Klient, turer: string[]): Promise<Map<string, { pakket: number; alle: number }>> {
  const ut = new Map<string, { pakket: number; alle: number }>();
  if (turer.length === 0) return ut;
  const { data } = await supabase.schema("pakkeliste").from("ting").select("tur_id, pakket_at").in("tur_id", turer).is("fjernet_at", null);
  for (const t of (data ?? []) as { tur_id: string; pakket_at: string | null }[]) {
    const f = ut.get(t.tur_id) ?? { pakket: 0, alle: 0 };
    f.alle++;
    if (t.pakket_at) f.pakket++;
    ut.set(t.tur_id, f);
  }
  return ut;
}

const kort = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });
const somDato = (d: string) => new Date(`${d}T12:00:00Z`);

/** «13.–16. feb.» eller «28. feb.–2. mars». */
export function periode(fra: string, til: string): string {
  if (fra === til) return kort.format(somDato(fra));
  const [a, b] = [kort.format(somDato(fra)), kort.format(somDato(til))];
  return fra.slice(0, 7) === til.slice(0, 7) ? `${a.split(".")[0]}.–${b}` : `${a}–${b}`;
}

/** Antall netter, f.eks. «3 netter». */
export function netter(fra: string, til: string): string {
  const n = Math.round((somDato(til).getTime() - somDato(fra).getTime()) / 86_400_000);
  return n === 0 ? "dagstur" : n === 1 ? "1 natt" : `${n} netter`;
}

/** Til flisen på startsiden: neste tur og hvor mye som er pakket. */
export async function pakkelisteStatus(supabase: Klient, husstand: string, idag: string): Promise<{ antall: number; tekst: string; personer: string[] } | null> {
  const { data } = await supabase
    .schema("pakkeliste")
    .from("turer")
    .select("id, tittel, fra, til, personer")
    .eq("household_id", husstand)
    .gte("til", idag)
    .order("fra")
    .limit(1);
  const tur = (data ?? [])[0] as Pick<Tur, "id" | "tittel" | "fra" | "til" | "personer"> | undefined;
  if (!tur) return null;
  const f = (await hentFremdrift(supabase, [tur.id])).get(tur.id);
  const dager = Math.round((Date.parse(`${tur.fra}T12:00:00Z`) - Date.parse(`${idag}T12:00:00Z`)) / 86_400_000);
  const nar = dager <= 0 ? "nå" : dager === 1 ? "i morgen" : `om ${dager} dager`;
  return { antall: 0, tekst: `${tur.tittel} ${nar}${f && f.alle ? ` · ${f.pakket}/${f.alle} pakket` : ""}`, personer: tur.personer };
}

export type Alltid = { id: string; person_id: string | null; navn: string; antall: number };

export async function hentAlltid(supabase: Klient, husstand: string): Promise<Alltid[]> {
  const { data } = await supabase.schema("pakkeliste").from("alltid").select("id, person_id, navn, antall").eq("household_id", husstand).order("created_at");
  return (data ?? []) as Alltid[];
}

export async function hentInstruksjoner(supabase: Klient, husstand: string): Promise<string> {
  const { data } = await supabase.schema("pakkeliste").from("innstillinger").select("instruksjoner").eq("household_id", husstand).maybeSingle();
  return (data?.instruksjoner as string | undefined) ?? "";
}

/** «ullundertøy, 3 sokker» eller én per linje → [{ navn, antall }]. «sokker x3» virker også. */
export function lesTing(tekst: string): { navn: string; antall: number }[] {
  return tekst
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((t) => {
      const m = t.match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i) ?? t.match(/^(.+?)\s*[x×]\s*(\d{1,2})$/i);
      const [navn, antall] = m ? (/^\d/.test(m[1]!) ? [m[2]!, Number(m[1])] : [m[1]!, Number(m[2])]) : [t, 1];
      return { navn: navn.slice(0, 120), antall: Math.min(Math.max(antall, 1), 99) };
    });
}

/** Tilbake til tekst i skjemaet: «3 sokker». */
export function tingTekst(t: { navn: string; antall: number }[]): string {
  return t.map((x) => (x.antall > 1 ? `${x.antall} ${x.navn}` : x.navn)).join("\n");
}
