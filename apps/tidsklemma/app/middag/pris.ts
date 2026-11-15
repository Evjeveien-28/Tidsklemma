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

export type Butikkvalg = Sum & { /** Kroner dyrere enn «billigst» (negativt hvis billigere, men innenfor toleransen). */ ekstra: number };

/** Prisene er anslag, så forskjeller under dette regnes som like. Da vinner butikkene husstanden har rangert høyest. */
export function toleranse(sum: number): number {
  return Math.max(10, sum * 0.01);
}

/** Lavest er best: rangeringene til butikkene, sammenlignet en og en. Én butikk slår to som starter med den. */
function rangering(valg: string[], butikker: string[]): number[] {
  return valg.map((b) => butikker.indexOf(b)).sort((a, b) => a - b);
}
function bedreRangert(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return a.length < b.length;
}

/**
 * Prisoversikten: «billigst» er den billigste måten å handle på, i én butikk eller fordelt på inntil `maks`,
 * og så én sum per butikk i rangert rekkefølge, hver med hvor mye dyrere den er.
 *
 * Standardvalget følger rangeringen: den høyest rangerte butikken, med mindre «billigst» sparer minst
 * `minBesparelse` kroner. Har husstanden valgt selv (`valgt`), brukes det.
 */
export function prisoversikt(innkjop: Innkjop[], butikker: string[], maks: number, minBesparelse: number, valgt?: string[]) {
  // Varene fordeles på butikkene i rangert rekkefølge, så lik pris havner hos den høyest rangerte.
  const hver = butikker.map((b) => summer(innkjop, [b]));
  const kandidater: Sum[] = [...hver];
  for (let k = 2; k <= Math.min(maks, butikker.length); k++) {
    for (const kombinasjon of kombinasjoner(butikker, k)) {
      const s = summer(innkjop, kombinasjon);
      // Bare fordelinger der hver butikk faktisk får noe.
      if (new Set(Object.values(s.plassering)).size === k) kandidater.push(s);
    }
  }
  const lavest = Math.min(...kandidater.map((s) => s.sum));
  let billigst: Sum | null = null;
  for (const s of kandidater) {
    if (s.sum > lavest + toleranse(lavest)) continue;
    if (!billigst || bedreRangert(rangering(s.butikker, butikker), rangering(billigst.butikker, butikker))) billigst = s;
  }
  const fordelt = billigst && billigst.butikker.length > 1 ? billigst : null;

  const rund = (n: number) => Math.round(n * 100) / 100;
  const alternativer: Butikkvalg[] = [...(fordelt ? [fordelt] : []), ...hver].map((s) => ({ ...s, ekstra: rund(s.sum - (billigst?.sum ?? s.sum)) }));
  const forste = alternativer.find((a) => a.butikker.length === 1);
  const standard = forste && billigst && forste.sum - billigst.sum < minBesparelse ? forste : (alternativer[0] ?? null);
  const nokkel = valgt?.join(",");
  const aktiv = (nokkel && alternativer.find((a) => a.butikker.join(",") === nokkel)) || (valgt?.length ? summer(innkjop, valgt) : standard);
  return { alternativer, billigst, fordelt, standard, aktiv };
}
