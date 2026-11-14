/** Ukens tilbud fra kundeavisene (eTilbudsavis/Tjek), og posisjonen til et postnummer (Kartverket). */
import { BUTIKKER } from "./butikker";

export type NyttTilbud = {
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
};

/** «1386» → Asker, med koordinater. Null hvis postnummeret ikke finnes. */
export async function hentPosisjon(postnummer: string): Promise<{ sted: string; lat: number; lng: number } | null> {
  try {
    const svar = await fetch(`https://ws.geonorge.no/adresser/v1/sok?postnummer=${postnummer}&treffPerSide=1&utkoordsys=4258`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const j = (await svar.json()) as { adresser?: { poststed: string; representasjonspunkt: { lat: number; lon: number } }[] };
    const a = j.adresser?.[0];
    return a ? { sted: a.poststed.charAt(0) + a.poststed.slice(1).toLowerCase(), lat: a.representasjonspunkt.lat, lng: a.representasjonspunkt.lon } : null;
  } catch {
    return null;
  }
}

type TjekTilbud = {
  id: string;
  heading: string;
  description: string | null;
  pricing: { price: number; pre_price: number | null };
  quantity?: { size?: { from: number; to: number }; unit?: { symbol: string } };
  run_from: string;
  run_till: string;
  images?: { view?: string; thumb?: string };
};

/** Alle tilbud i butikkene innen 20 km. Noen få kall per kjede, med en liten pause imellom. */
export async function hentTilbud(butikker: string[], lat: number, lng: number): Promise<NyttTilbud[]> {
  const ut: NyttTilbud[] = [];
  for (const kode of butikker) {
    const kjede = BUTIKKER.find((b) => b.kode === kode);
    if (!kjede?.tjek) continue;
    for (let side = 0; side < 10; side++) {
      const url = `https://squid-api.tjek.com/v2/offers?dealer_ids=${kjede.tjek}&r_lat=${lat}&r_lng=${lng}&r_radius=20000&r_locale=nb_NO&limit=100&offset=${side * 100}`;
      let liste: TjekTilbud[];
      try {
        const svar = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Tidsklemma/1.0)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
        if (!svar.ok) break;
        liste = (await svar.json()) as TjekTilbud[];
      } catch {
        break;
      }
      for (const o of liste) {
        if (!o.heading || typeof o.pricing?.price !== "number") continue;
        ut.push({
          id: o.id,
          butikk: kode,
          navn: o.heading.slice(0, 300),
          beskrivelse: (o.description ?? "").slice(0, 2000),
          pris: o.pricing.price,
          forpris: o.pricing.pre_price ?? null,
          mengde_fra: o.quantity?.size?.from ?? null,
          mengde_til: o.quantity?.size?.to ?? null,
          enhet: o.quantity?.unit?.symbol ?? null,
          gyldig_fra: o.run_from,
          gyldig_til: o.run_till,
          bilde_url: o.images?.thumb ?? o.images?.view ?? null,
        });
      }
      if (liste.length < 100) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  // Samme tilbud kan komme fra flere butikker i kjeden.
  return [...new Map(ut.map((t) => [t.id, t])).values()];
}
