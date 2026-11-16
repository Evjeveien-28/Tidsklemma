import type { createClient } from "@hjem/db/server";
import type { Produkt } from "./oda";

type Klient = Awaited<ReturnType<typeof createClient>>;

export type Vare = {
  id: string;
  navn: string;
  antall: number;
  butikk: string | null;
  produkt: Produkt | null;
  uten_pris: boolean;
  kilde: "middag" | null;
  avkrysset_at: string | null;
  created_at: string;
};

export const VAREFELT = "id, navn, antall, butikk, produkt, uten_pris, kilde, avkrysset_at, created_at";

export async function hentVarer(supabase: Klient, husstand: string): Promise<Vare[]> {
  const { data, error } = await supabase
    .schema("handleliste")
    .from("varer")
    .select(VAREFELT)
    .eq("household_id", husstand)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data as Vare[]).map((v) => ({ ...v, antall: Number(v.antall) }));
}

/** Anslått pris for varen, eller null når den ikke har pris. */
export function anslag(v: Pick<Vare, "produkt" | "uten_pris" | "antall"> & { butikk?: string | null }): number | null {
  if (v.uten_pris || !v.produkt) return null;
  // Varer fra Middag har pris per butikk: bruk prisen i butikken varen står på (den kan være flyttet).
  const iButikk = v.butikk ? v.produkt.middag?.priser[v.butikk] : undefined;
  const pris = iButikk ? iButikk.pris : v.produkt.pris;
  return pris == null ? null : Math.round(pris * v.antall * 100) / 100;
}

const kroner = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const ore = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «486» for summer, «19,40» for enkeltvarer. */
export function kr(n: number, heleKroner = false): string {
  return heleKroner || Number.isInteger(n) ? kroner.format(Math.round(n)) : ore.format(n);
}

/** Ukens tilbud (fra Middag) som passer med varen, billigst først. */
export type TilbudTreff = { butikk: string; navn: string; pris: number };

export function finnTilbud(navn: string, tilbud: { butikk: string; navn: string; pris: number; gyldig_til: string }[]): TilbudTreff | null {
  const ord = navn.toLowerCase().split(/\s+/).filter((o) => o.length >= 3 && !/^\d/.test(o));
  if (ord.length === 0) return null;
  // Hele ord, så «melk» ikke treffer «melkesjokolade».
  const hele = ord.map((o) => new RegExp(`(^|[^a-zæøå])${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zæøå]|$)`, "i"));
  const naa = new Date().toISOString();
  const treff = tilbud.filter((t) => t.gyldig_til >= naa && hele.every((r) => r.test(t.navn)));
  return treff.sort((a, b) => a.pris - b.pris)[0] ?? null;
}

/** «Tine Lettmelk 0,5% fett» + «0,5% fett, 1,75 l» → «Tine Lettmelk 0,5% fett, 1,75 l». */
export function produktTekst(p: { navn: string; ekstra: string }): string {
  const deler = p.ekstra.split(",").map((d) => d.trim()).filter((d) => d && !p.navn.toLowerCase().includes(d.toLowerCase()));
  return [p.navn, ...deler].join(", ");
}
