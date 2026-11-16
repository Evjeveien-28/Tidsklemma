/**
 * Søk i nettbutikkene til NorgesGruppen (Meny, Spar og Joker), for å finne vanlig hyllepris i kjeden.
 * Det er API-et nettsidene deres selv bruker, ikke et offisielt API, så det kan endre seg.
 * Kiwi bruker samme API, men viser ingen varer uten en bestemt butikk, så Kiwi er ikke med.
 */

/** Kjede-id-ene i NorgesGruppens API, per butikk-kode i appen. */
export const NG_KJEDER: Record<string, number> = { MENY_NO: 1300, SPAR_NO: 1210, JOKER_NO: 1220 };

export type NgProdukt = {
  navn: string;
  ean: string | null;
  /** Pris for én pakning, eller per kg når `enhet` er «kg» (løsvekt). */
  pris: number;
  enhet: string | null;
  sammenligningspris: number | null;
  sammenligningsenhet: string | null;
  /** Kjedens eget tilbud, med vanlig pris. Null hvis varen ikke er på tilbud. */
  tilbud: { forpris: number } | null;
};

type NgKilde = {
  title?: string;
  subtitle?: string;
  ean?: string;
  pricePerUnit?: number;
  pricePerUnitOriginal?: number;
  unit?: string;
  comparePricePerUnit?: number;
  compareUnit?: string;
  /** «kg» for løsvekt og ferskvaredisk: da er `pricePerUnit` prisen for en bit på `unitWeight` kg, ikke for en kilo. */
  calcUnit?: string;
  unitWeight?: number;
  isOffer?: boolean;
  isForSale?: boolean;
};

export async function sokNorgesgruppen(butikk: string, sok: string, antall = 4): Promise<NgProdukt[]> {
  const kjede = NG_KJEDER[butikk];
  if (!kjede) return [];
  const qs = new URLSearchParams({ search: sok, page: "1", page_size: String(antall + 2), full_response: "true", fieldset: "maximal" });
  try {
    // «0» er ingen bestemt butikk: da gir API-et kjedens nettbutikkpris.
    const svar = await fetch(`https://platform-rest-prod.ngdata.no/api/products/${kjede}/0?${qs}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Tidsklemma/1.0)", Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!svar.ok) return [];
    const j = (await svar.json()) as { hits?: { hits?: { _source: NgKilde }[] } } | unknown[];
    const treff = Array.isArray(j) ? [] : (j.hits?.hits ?? []);
    return treff
      .map((h) => h._source)
      .filter((p) => p.isForSale !== false && Number(p.pricePerUnit) > 0)
      .slice(0, antall)
      .map((p) => {
        const navn = [p.title, p.subtitle].filter(Boolean).join(" ");
        const tilbud = p.isOffer && p.pricePerUnitOriginal && p.pricePerUnitOriginal > Number(p.pricePerUnit) ? { forpris: p.pricePerUnitOriginal } : null;
        // Løsvekt: oppgi kiloprisen, ellers ser en bit på 140 g ut som en billig kilo.
        if (p.calcUnit === "kg" && p.comparePricePerUnit) {
          const faktor = p.comparePricePerUnit / Number(p.pricePerUnit);
          return {
            navn: `${navn} (løsvekt, pris per kg)`,
            ean: p.ean ?? null,
            pris: p.comparePricePerUnit,
            enhet: "kg",
            sammenligningspris: p.comparePricePerUnit,
            sammenligningsenhet: "kg",
            tilbud: tilbud && { forpris: Math.round(tilbud.forpris * faktor * 100) / 100 },
          };
        }
        return {
          navn,
          ean: p.ean ?? null,
          pris: Number(p.pricePerUnit),
          enhet: p.unit ?? null,
          sammenligningspris: p.comparePricePerUnit ?? null,
          sammenligningsenhet: p.compareUnit ?? null,
          tilbud,
        };
      });
  } catch {
    return [];
  }
}
