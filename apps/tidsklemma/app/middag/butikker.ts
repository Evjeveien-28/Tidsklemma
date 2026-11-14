/** Matbutikkene vi kan hente tilbud og priser fra. Koden er den Kassalapp bruker, Tjek-id er kjeden i eTilbudsavis. */
export const BUTIKKER = [
  { kode: "KIWI", navn: "Kiwi", tjek: "257bxm" },
  { kode: "REMA_1000", navn: "Rema 1000", tjek: "faa0Ym" },
  { kode: "COOP_EXTRA", navn: "Extra", tjek: "80742m" },
  { kode: "MENY_NO", navn: "Meny", tjek: "4333pm" },
  { kode: "COOP_MEGA", navn: "Coop Mega", tjek: "de79dm" },
  { kode: "COOP_PRIX", navn: "Coop Prix", tjek: "f5d5lm" },
  { kode: "COOP_OBS", navn: "Obs", tjek: "51dawm" },
  { kode: "SPAR_NO", navn: "Spar", tjek: "c062vm" },
  { kode: "JOKER_NO", navn: "Joker", tjek: "b3e8Fm" },
  { kode: "BUNNPRIS", navn: "Bunnpris", tjek: "5b11sm" },
] as const;

export function butikkNavn(kode: string): string {
  return BUTIKKER.find((b) => b.kode === kode)?.navn ?? kode;
}
