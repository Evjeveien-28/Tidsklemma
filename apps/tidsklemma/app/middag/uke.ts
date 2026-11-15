import { iDag, leggTilDager, naa } from "../dato";

const somDato = (d: string) => new Date(`${d}T12:00:00Z`);

/** 1 = mandag … 7 = søndag. */
export function ukedag(dato: string): number {
  return ((somDato(dato).getUTCDay() + 6) % 7) + 1;
}

export function mandagI(dato: string): string {
  return leggTilDager(dato, 1 - ukedag(dato));
}

/** Mandag–torsdag gjelder menyen resten av denne uka. Fra fredag gjelder den neste uke. */
export function standardUke(idag = iDag()): string {
  return ukedag(idag) <= 4 ? mandagI(idag) : leggTilDager(mandagI(idag), 7);
}

/** Etter dette er det for sent å planlegge dagens middag. */
const SISTE_PLANLEGGING_I_DAG = "16:00";

/** Datoene i uka med middag som fortsatt kan planlegges: fra i morgen, og i dag frem til ettermiddagen. */
export function middagsdager(mandag: string, dager: number[], idag = iDag(), klokka = naa()): string[] {
  return [1, 2, 3, 4, 5, 6, 7]
    .filter((d) => dager.includes(d))
    .map((d) => leggTilDager(mandag, d - 1))
    .filter((dato) => dato > idag || (dato === idag && klokka < SISTE_PLANLEGGING_I_DAG));
}

/** «Uke 47». */
export function ukeNr(mandag: string): string {
  return ukeTekst(mandag).split(",")[0]!;
}

const dagFormat = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const kortFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });

/** «Mandag 16. nov.» */
export function dagTekst(dato: string): string {
  const t = dagFormat.format(somDato(dato));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** «Uke 47, 16.–22. nov.» */
export function ukeTekst(mandag: string): string {
  const d = somDato(mandag);
  const tors = new Date(d);
  tors.setUTCDate(d.getUTCDate() + 3);
  const forsteJan = new Date(Date.UTC(tors.getUTCFullYear(), 0, 1));
  const nr = Math.ceil(((tors.getTime() - forsteJan.getTime()) / 86_400_000 + 1) / 7);
  return `Uke ${nr}, ${kortFormat.format(d)}–${kortFormat.format(somDato(leggTilDager(mandag, 6)))}`;
}
