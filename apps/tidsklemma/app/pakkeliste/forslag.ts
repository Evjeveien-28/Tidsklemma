/**
 * Forslag til «alltid med» og instruksjoner, før husstanden har lagret egne. Bare utgangspunkt: de tilpasses og lagres.
 */

export function alltidForslag(fodselsar: number | null, iar = new Date().getFullYear()): string[] {
  const alder = fodselsar ? iar - fodselsar : null;
  if (alder != null && alder < 3) return ["Bleier", "Våtservietter", "Smokk", "Kosedyr", "Nattøy", "Tannbørste", "Skiftetøy"];
  if (alder != null && alder < 13) return ["Tannbørste", "Nattøy", "Kosedyr", "Bok eller spill til turen", "Drikkeflaske"];
  if (alder != null && alder < 18) return ["Mobil og lader", "Hodetelefoner", "Tannbørste", "Nattøy", "Toalettsaker"];
  return ["Mobil og lader", "Tannbørste", "Toalettsaker", "Nattøy", "Medisiner"];
}

export const FELLES_FORSLAG = ["Førstehjelpsskrin", "Plaster", "Paracet og Ibux", "Ladere og skjøteledning", "Våtservietter", "Søppelposer"];

export const INSTRUKSJONER_FORSLAG =
  "Vi reiser som regel med bil, så det er greit med litt ekstra. Til hytta tar vi med mat til første kveld og frokost. " +
  "Foreslå lag-på-lag-klær når det er kaldt, og regntøy når det er meldt regn.";
