/** Søk i sortimentet til Oda, for å anslå prisen på en vare. Ikke et offisielt API, så det kan endre seg. */

export type Produkt = {
  id: number;
  navn: string;
  ekstra: string;
  pris: number;
  kilopris: number | null;
  enhet: string | null;
  bilde: string | null;
  /** Odas egne tilbud, f.eks. «Kjøp 3, få 5 %». */
  tilbud: string | null;
  /** Bare på varer fra Middag: prisen i hver av husstandens butikker, så varen kan flyttes og sammenlignes. */
  middag?: MiddagPriser;
};

export type MiddagPriser = {
  /** Innkjøpets id i ukesmenyen, så en flytting kan lagres der også. */
  innkjop: string;
  priser: Record<string, { pris: number | null; tilbud: boolean; anslag: boolean }>;
  /** Butikkene handelen er fordelt på. Prisforskjellen vises mot de andre av disse. */
  fordeling: string[];
};

type OdaProdukt = {
  id: number;
  full_name: string;
  name_extra?: string;
  gross_price: string;
  gross_unit_price?: string;
  unit_price_quantity_abbreviation?: string;
  availability?: { is_available: boolean };
  discount?: { is_discounted?: boolean; description_short?: string } | null;
  images?: { thumbnail?: { url: string } }[];
};

export async function sokOda(sok: string, antall = 6): Promise<Produkt[]> {
  try {
    const svar = await fetch(`https://oda.com/api/v1/search/?q=${encodeURIComponent(sok)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Tidsklemma/1.0)", Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!svar.ok) return [];
    const j = (await svar.json()) as { products?: OdaProdukt[] };
    return (j.products ?? [])
      .filter((p) => p.availability?.is_available !== false && Number(p.gross_price) > 0)
      .slice(0, antall)
      .map((p) => ({
        id: p.id,
        navn: p.full_name,
        ekstra: p.name_extra ?? "",
        pris: Number(p.gross_price),
        kilopris: p.gross_unit_price ? Number(p.gross_unit_price) : null,
        enhet: p.unit_price_quantity_abbreviation ?? null,
        bilde: p.images?.[0]?.thumbnail?.url ?? null,
        tilbud: p.discount?.is_discounted ? (p.discount.description_short ?? "Tilbud") : null,
      }));
  } catch {
    return [];
  }
}
