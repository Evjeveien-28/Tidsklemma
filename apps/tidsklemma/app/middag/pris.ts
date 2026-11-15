import type { Innkjop } from "./meny";

export function prisHos(i: Innkjop, butikk: string): { pris: number | null; tilbud: boolean } {
  const p = i.priser[butikk];
  return p ? { pris: p.pris, tilbud: Boolean(p.tilbud) } : { pris: i.referanse, tilbud: false };
}

export type Sum = { butikker: string[]; sum: number; mangler: number; tilbud: number; plassering: Record<string, string> };

/** Hva alt koster om vi handler i disse butikkene, og hver vare kjøpes der den er billigst. Lik pris: høyest rangerte. */
export function summer(innkjop: Innkjop[], butikker: string[]): Sum {
  let sum = 0;
  let mangler = 0;
  let tilbud = 0;
  const plassering: Record<string, string> = {};
  for (const i of innkjop) {
    let best: { butikk: string; pris: number; tilbud: boolean } | null = null;
    for (const b of butikker) {
      const p = prisHos(i, b);
      if (p.pris != null && (!best || p.pris < best.pris - 0.001)) best = { butikk: b, pris: p.pris, tilbud: p.tilbud };
    }
    if (!best) {
      mangler++;
      plassering[i.id] = butikker[0]!;
      continue;
    }
    sum += best.pris;
    if (best.tilbud) tilbud++;
    plassering[i.id] = best.butikk;
  }
  return { butikker, sum: Math.round(sum * 100) / 100, mangler, tilbud, plassering };
}

function kombinasjoner<T>(liste: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return liste.flatMap((x, i) => kombinasjoner(liste.slice(i + 1), k - 1).map((r) => [x, ...r]));
}

/**
 * Prisoversikten: én sum per butikk i rangert rekkefølge, og den billigste fordelingen på inntil `maks` butikker
 * hvis den sparer minst `minBesparelse` kroner mot den billigste enkeltbutikken.
 */
export function prisoversikt(innkjop: Innkjop[], butikker: string[], maks: number, minBesparelse: number) {
  const hver = butikker.map((b) => summer(innkjop, [b]));
  const billigst = hver.reduce<Sum | null>((a, s) => (!a || s.sum < a.sum - 0.001 ? s : a), null);
  let fordelt: Sum | null = null;
  for (let k = 2; k <= Math.min(maks, butikker.length); k++) {
    for (const valg of kombinasjoner(butikker, k)) {
      const s = summer(innkjop, valg);
      // Bare fordelinger der hver butikk faktisk får noe.
      if (new Set(Object.values(s.plassering)).size < k) continue;
      if (!fordelt || s.sum < fordelt.sum - 0.001) fordelt = s;
    }
  }
  const spar = billigst && fordelt ? Math.round((billigst.sum - fordelt.sum) * 100) / 100 : 0;
  return { hver, billigst, fordelt: fordelt && spar >= minBesparelse ? { ...fordelt, spar } : null };
}
