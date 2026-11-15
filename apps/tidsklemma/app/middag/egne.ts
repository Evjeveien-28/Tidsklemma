import type { createClient } from "@hjem/db/server";
import { sokOda } from "../handleliste/oda";
import { harHjemme, valgteInnkjop, valgteRetter, type Innkjop, type Meny } from "./meny";
import { ingrediensord } from "./tilbud-match";

type Klient = Awaited<ReturnType<typeof createClient>>;

/** «400 g kjøttdeig» → «kjøttdeig», til søket hos Oda. */
const tilSok = (linje: string) => linje.replace(/^[\d.,/\s]+(g|kg|dl|l|ss|ts|stk\.?|pk\.?|boks|ml)?\s+/i, "");

/**
 * Ingrediensene i egne oppskrifter husstanden har valgt i menyen, som innkjøp med pris anslått fra Oda.
 * Varer de alltid har hjemme, tas ikke med. Brukes samme oppskrift flere dager, kommer ingrediensene én gang.
 */
export async function egneInnkjop(supabase: Klient, meny: Pick<Meny, "data" | "valg">, basisvarer: string[]): Promise<Innkjop[]> {
  const ider = [...new Set(valgteRetter(meny).flatMap((r) => (r.type === "egen" ? [r.oppskrift_id] : [])))];
  if (ider.length === 0) return [];
  const { data } = await supabase.schema("middag").from("oppskrifter").select("id, navn, ingredienser").in("id", ider);
  const basis = new Set(basisvarer.flatMap(ingrediensord));
  const linjer = (data ?? [])
    .flatMap((o) => (o.ingredienser as string[]).map((navn, n) => ({ id: `egen:${o.id}:${n}`, navn, rett: o.navn as string })))
    .filter((l) => {
      const ord = ingrediensord(l.navn);
      return ord.length === 0 || !ord.every((w) => basis.has(w));
    })
    .slice(0, 60);
  const treff = await Promise.all(linjer.map((l) => sokOda(tilSok(l.navn), 1)));
  return linjer.map((l, n) => ({ id: l.id, navn: l.navn.slice(0, 120), bruk: `Til ${l.rett}`, priser: {}, referanse: treff[n]![0]?.pris ?? null }));
}

/** Alle innkjøpene for uka: fra de valgte forslagene og fra egne oppskrifter. `hjemme` er det vi har hjemme. */
export async function ukensInnkjop(supabase: Klient, meny: Pick<Meny, "data" | "valg">, basisvarer: string[]) {
  const egne = await egneInnkjop(supabase, meny, basisvarer);
  const alle = [...valgteInnkjop(meny, true), ...egne];
  return { innkjop: alle.filter((i) => !harHjemme(meny, i)), hjemme: alle.filter((i) => harHjemme(meny, i)) };
}
