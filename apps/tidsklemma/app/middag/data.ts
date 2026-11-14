import type { createClient } from "@hjem/db/server";

export { lesMerkelapper } from "./lese";

type Klient = Awaited<ReturnType<typeof createClient>>;

export type Innstillinger = {
  dager: number[];
  butikker: string[];
  maks_butikker: number;
  min_besparelse: number;
  postnummer: string | null;
  hverdag_minutter: number;
  onsker: string;
  aktiv: boolean;
};

export const STANDARD: Innstillinger = {
  dager: [1, 2, 3, 4, 5, 6, 7],
  butikker: ["KIWI"],
  maks_butikker: 1,
  min_besparelse: 50,
  postnummer: null,
  hverdag_minutter: 45,
  onsker: "",
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
  "id, household_id, navn, lenke, ingredienser, fremgangsmaate, minutter, porsjoner, merkelapper, bilde_url, favoritt, trygg, trenger_utfylling, created_at";

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
