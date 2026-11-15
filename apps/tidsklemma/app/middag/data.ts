import type { createClient } from "@hjem/db/server";

export { lesMerkelapper } from "./lese";
import type { Meny } from "./meny";

type Klient = Awaited<ReturnType<typeof createClient>>;

export type Innstillinger = {
  dager: number[];
  butikker: string[];
  maks_butikker: number;
  min_besparelse: number;
  postnummer: string | null;
  sted: string | null;
  lat: number | null;
  lng: number | null;
  hverdag_minutter: number;
  onsker: string;
  /** Varer vi alltid har hjemme, som ikke kommer på handlelisten. */
  basisvarer: string[];
  aktiv: boolean;
};

export const BASISVARER = ["salt", "pepper", "olje", "smør til steking", "hvetemel", "sukker", "tørket krydder", "buljong"];

/** «salt, pepper\nolje» → ["salt", "pepper", "olje"]. */
export function lesBasisvarer(tekst: string): string[] {
  return [...new Set(tekst.split(/[,;\n]/).map((v) => v.trim().toLowerCase()).filter(Boolean))].slice(0, 100).map((v) => v.slice(0, 60));
}

export const STANDARD: Innstillinger = {
  dager: [1, 2, 3, 4, 5, 6, 7],
  butikker: ["KIWI"],
  maks_butikker: 1,
  min_besparelse: 50,
  postnummer: null,
  sted: null,
  lat: null,
  lng: null,
  hverdag_minutter: 45,
  onsker: "",
  basisvarer: BASISVARER,
  aktiv: false,
};

export type Allergi = {
  id: string;
  navn: string;
  person_id: string | null;
  grad: "streng" | "hoved" | "helst";
  handtering: "variant" | "bytt" | "unnga";
  erstatning: string;
};

export const GRADER = [
  { verdi: "streng", navn: "Streng", forklaring: "Ingenting, heller ikke små mengder" },
  { verdi: "hoved", navn: "Bare hovedingredienser", forklaring: "Litt i saus eller jevning går fint" },
  { verdi: "helst", navn: "Helst uten", forklaring: "Velg uten når det er enkelt" },
] as const;

export const HANDTERINGER = [
  { verdi: "variant", navn: "Egen variant", forklaring: "F.eks. glutenfri pasta til den det gjelder" },
  { verdi: "bytt", navn: "Bytt for alle", forklaring: "F.eks. nøtter → pinjekjerner i hele retten" },
  { verdi: "unnga", navn: "Unngå helt", forklaring: "Retter med dette foreslås ikke" },
] as const;

export const OPPSKRIFTFELT =
  "id, household_id, navn, lenke, ingredienser, fremgangsmaate, minutter, porsjoner, merkelapper, bilde_url, favoritt, trygg, trenger_utfylling, utfylling_forsokt, created_at";

export type Oppskrift = {
  id: string;
  household_id: string;
  navn: string;
  lenke: string | null;
  ingredienser: string[];
  fremgangsmaate: string;
  minutter: number | null;
  porsjoner: number | null;
  merkelapper: string[];
  bilde_url: string | null;
  favoritt: boolean;
  trygg: boolean;
  trenger_utfylling: boolean;
  /** Sist agenten prøvde å lese oppskriften fra siden. */
  utfylling_forsokt: string | null;
  created_at: string;
};

export const UKEDAGER = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export async function hentInnstillinger(supabase: Klient, husstand: string): Promise<Innstillinger> {
  const { data, error } = await supabase.schema("middag").from("innstillinger").select("*").eq("household_id", husstand).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...STANDARD, ...(data as Partial<Innstillinger>) } : STANDARD;
}

export async function hentAllergier(supabase: Klient, husstand: string): Promise<Allergi[]> {
  const { data, error } = await supabase
    .schema("middag")
    .from("allergier")
    .select("id, navn, person_id, grad, handtering, erstatning")
    .eq("household_id", husstand)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data as Allergi[];
}

/** Stjernemerkede først, så alfabetisk. */
export async function hentOppskrifter(supabase: Klient, husstand: string): Promise<Oppskrift[]> {
  const { data, error } = await supabase
    .schema("middag")
    .from("oppskrifter")
    .select(OPPSKRIFTFELT)
    .eq("household_id", husstand)
    .order("favoritt", { ascending: false })
    .order("navn");
  if (error) throw new Error(error.message);
  return data as Oppskrift[];
}


/** Merkelappene som er brukt i kokeboka, mest brukte først. */
export function alleMerkelapper(oppskrifter: Pick<Oppskrift, "merkelapper">[]): string[] {
  const antall = new Map<string, number>();
  for (const o of oppskrifter) for (const m of o.merkelapper) antall.set(m, (antall.get(m) ?? 0) + 1);
  return [...antall].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nb")).map(([m]) => m);
}

export type Tilbud = {
  id: string;
  butikk: string;
  navn: string;
  beskrivelse: string;
  pris: number;
  forpris: number | null;
  mengde_fra: number | null;
  mengde_til: number | null;
  enhet: string | null;
  gyldig_fra: string;
  gyldig_til: string;
  bilde_url: string | null;
  hentet_at: string;
};

export async function hentTilbudFraDb(supabase: Klient, husstand: string): Promise<Tilbud[]> {
  const alle: Tilbud[] = [];
  // PostgREST gir høyst 1000 rader om gangen.
  for (let fra = 0; ; fra += 1000) {
    const { data, error } = await supabase
      .schema("middag")
      .from("tilbud")
      .select("id, butikk, navn, beskrivelse, pris, forpris, mengde_fra, mengde_til, enhet, gyldig_fra, gyldig_til, bilde_url, hentet_at")
      .eq("household_id", husstand)
      .order("navn")
      .range(fra, fra + 999);
    if (error) throw new Error(error.message);
    alle.push(...(data as Tilbud[]).map((t) => ({ ...t, pris: Number(t.pris), forpris: t.forpris == null ? null : Number(t.forpris) })));
    if (data.length < 1000) return alle;
  }
}

export type Bestilling = { id: string; uke_start: string; status: "venter" | "jobber" | "ferdig" | "feil"; melding: string | null; bestilt_av: string | null; created_at: string };

export async function hentMeny(supabase: Klient, husstand: string, uke: string): Promise<Meny | null> {
  const { data, error } = await supabase
    .schema("middag")
    .from("menyer")
    .select("id, uke_start, data, valg, laget_at")
    .eq("household_id", husstand)
    .eq("uke_start", uke)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Meny | null;
}

export async function hentSisteBestilling(supabase: Klient, husstand: string, uke: string): Promise<Bestilling | null> {
  const { data } = await supabase
    .schema("middag")
    .from("bestillinger")
    .select("id, uke_start, status, melding, bestilt_av, created_at")
    .eq("household_id", husstand)
    .eq("uke_start", uke)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Bestilling | null) ?? null;
}
