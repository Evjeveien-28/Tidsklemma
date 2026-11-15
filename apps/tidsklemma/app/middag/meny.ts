/**
 * Menyen agenten lager for en uke. Innkjøpene er felles for uka, og hver rett peker på innkjøpene den bruker.
 * Bruker to retter samme pakke kyllingfilet, står den én gang på handlelisten.
 */

/** Prisen på et innkjøp i én butikk. */
export type Pris = { pris: number; tilbud?: boolean; vare?: string };

export type Innkjop = {
  id: string;
  /** Det som skal kjøpes, f.eks. «Kyllingfilet 1 kg». */
  navn: string;
  /** Hva det brukes til, f.eks. «600 g mandag, 400 g onsdag». */
  bruk?: string;
  /** Pris per butikk-kode. Mangler en butikk, brukes referanseprisen. */
  priser: Record<string, Pris>;
  /** Vanlig pris (fra Oda), brukt der butikken ikke har egen pris. */
  referanse: number | null;
  /** Har vi trolig igjen fra forrige uke, f.eks. «Ca. 750 g igjen fra forrige uke». Står da under «Har hjemme». */
  rest?: string;
};

export type Alternativ = {
  oppskrift_id: string;
  navn: string;
  /** Kort hvorfor, f.eks. «Kyllingfilet på tilbud hos Kiwi». */
  begrunnelse?: string;
  /** F.eks. «Glutenfri pasta til Andreas». */
  tilpasninger?: string[];
  minutter?: number | null;
  /** Id-ene til innkjøpene retten bruker. */
  bruker: string[];
};

export type Dag = { dato: string; personer: number; alternativer: Alternativ[] };

export type MenyData = { dager: Dag[]; innkjop: Innkjop[]; merknad?: string };

/** Husstandens valg: alternativ eller egen oppskrift per dato, varer vi har hjemme, og valgt fordeling av handelen. */
export type Valg = {
  dager?: Record<string, { alt?: number; oppskrift_id?: string }>;
  har?: string[];
  /** Rester agenten trodde vi hadde, men som vi likevel må kjøpe. */
  trenger?: string[];
  fordeling?: string[];
};

export type Meny = { id: string; uke_start: string; data: MenyData; valg: Valg; laget_at: string };

export type ValgtRett =
  | { type: "alternativ"; dag: Dag; indeks: number; alt: Alternativ }
  | { type: "egen"; dag: Dag; oppskrift_id: string };

export function valgteRetter(meny: Pick<Meny, "data" | "valg">): ValgtRett[] {
  return meny.data.dager.map((dag) => {
    const v = meny.valg.dager?.[dag.dato];
    if (v?.oppskrift_id && !dag.alternativer.some((a) => a.oppskrift_id === v.oppskrift_id))
      return { type: "egen", dag, oppskrift_id: v.oppskrift_id };
    const indeks = v?.oppskrift_id
      ? dag.alternativer.findIndex((a) => a.oppskrift_id === v.oppskrift_id)
      : Math.min(v?.alt ?? 0, dag.alternativer.length - 1);
    return { type: "alternativ", dag, indeks, alt: dag.alternativer[indeks]! };
  });
}

/** Har vi varen hjemme: krysset av selv, eller en rest fra forrige uke vi ikke har sagt at vi trenger. */
export function harHjemme(meny: Pick<Meny, "valg">, i: Innkjop): boolean {
  return (meny.valg.har ?? []).includes(i.id) || (Boolean(i.rest) && !(meny.valg.trenger ?? []).includes(i.id));
}

/** Innkjøpene de valgte rettene trenger, uten det vi har hjemme. */
export function valgteInnkjop(meny: Pick<Meny, "data" | "valg">, medHjemme = false): Innkjop[] {
  const ider = new Set(valgteRetter(meny).flatMap((r) => (r.type === "alternativ" ? r.alt.bruker : [])));
  return meny.data.innkjop.filter((i) => ider.has(i.id) && (medHjemme || !harHjemme(meny, i)));
}
