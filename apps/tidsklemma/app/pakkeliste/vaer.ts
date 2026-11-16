/**
 * Været for en tur: stedet slås opp hos Kartverket (Norge) eller Open-Meteo (resten av verden),
 * og varselet hentes fra Meteorologisk institutt (api.met.no). Ingen nøkler, men met.no vil ha et navn og en kontakt.
 * Varselet rekker omtrent ti dager frem. Turer lenger frem får ingen dager, bare stedet.
 */

const AGENT = "Tidsklemma github.com/Evjeveien-28/Tidsklemma";

export type Sted = { navn: string; land: string; lat: number; lng: number; tidssone: string };
export type Vaerdag = { dato: string; min: number; maks: number; nedbor: number; vind: number; symbol: string };
export type Vaer = { sted: Sted; dager: Vaerdag[]; utenforVarsel: boolean };

async function json<T>(url: string): Promise<T | null> {
  try {
    const svar = await fetch(url, { headers: { "User-Agent": AGENT }, signal: AbortSignal.timeout(8_000), next: { revalidate: 3600 } });
    return svar.ok ? ((await svar.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * «Hafjell» → Hafjell, Norge. «Paris» → Paris, Frankrike (en stor by i utlandet slår et lite norsk stedsnavn).
 * «Paris, Frankrike» eller «Gran Canaria» går rett til resten av verden.
 */
export async function finnSted(sok: string): Promise<Sted | null> {
  const [forste, ...resten] = sok.split(",").map((d) => d.trim());
  const s = forste ?? "";
  if (!s) return null;
  const hint = resten.join(" ").toLowerCase();

  const [norsk, verden] = await Promise.all([
    json<{ navn?: { skrivemåte: string; representasjonspunkt: { nord: number; øst: number } }[] }>(
      `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(s)}&treffPerSide=1&utkoordsys=4258`,
    ),
    json<{ results?: { name: string; country?: string; latitude: number; longitude: number; timezone?: string; population?: number }[] }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(s)}&count=10&language=nb`,
    ),
  ]);
  // Står det et land etter kommaet («Paris, Frankrike»), gjelder det. Ellers er det bare mer om stedet («Hafjell, Øyer»).
  const iLand = (r: { country?: string }) => Boolean(hint && r.country && (hint.includes(r.country.toLowerCase()) || r.country.toLowerCase().includes(hint)));
  const utland = (verden?.results ?? []).some((r) => iLand(r) && r.country !== "Norge");
  const v = utland ? verden!.results!.find(iLand) : verden?.results?.[0];
  const somSted = (r: NonNullable<typeof v>): Sted => ({ navn: r.name, land: r.country ?? "", lat: r.latitude, lng: r.longitude, tidssone: r.timezone ?? "UTC" });
  // Bare et eksakt norsk treff, ellers blir «Gran Canaria» til et sted i Norge.
  const n = norsk?.navn?.find((x) => x.skrivemåte.toLowerCase() === s.toLowerCase());
  const storByUte = v && v.country !== "Norge" && (v.population ?? 0) >= 100_000;
  if (n && !storByUte && !utland) return { navn: n.skrivemåte, land: "Norge", lat: n.representasjonspunkt.nord, lng: n.representasjonspunkt.øst, tidssone: "Europe/Oslo" };
  return v ? somSted(v) : null;
}

type Tidssteg = {
  time: string;
  data: {
    instant: { details: { air_temperature: number; wind_speed: number } };
    next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } };
    next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } };
  };
};

/** Varselet for dagene fra–til, oppsummert per dag (lokal tid på stedet). */
export async function hentVaer(sted: Sted, fra: string, til: string): Promise<Vaer> {
  const lat = sted.lat.toFixed(4);
  const lng = sted.lng.toFixed(4);
  const svar = await json<{ properties: { timeseries: Tidssteg[] } }>(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`);
  const steg = svar?.properties.timeseries ?? [];
  const lokal = new Intl.DateTimeFormat("en-CA", { timeZone: sted.tidssone, year: "numeric", month: "2-digit", day: "2-digit" });

  const perDag = new Map<string, Tidssteg[]>();
  for (const s of steg) {
    const dato = lokal.format(new Date(s.time));
    if (dato < fra || dato > til) continue;
    perDag.set(dato, [...(perDag.get(dato) ?? []), s]);
  }
  const dager: Vaerdag[] = [...perDag.entries()].map(([dato, s]) => {
    const temp = s.map((x) => x.data.instant.details.air_temperature);
    // Timesnedbør der den finnes. Lenger frem er stegene seks timer, og da brukes seks-timersnedbøren.
    const nedbor = s.reduce((sum, x) => sum + (x.data.next_1_hours?.details.precipitation_amount ?? x.data.next_6_hours?.details.precipitation_amount ?? 0), 0);
    const symboler = s.map((x) => (x.data.next_6_hours ?? x.data.next_1_hours)?.summary.symbol_code.replace(/_(day|night|polartwilight)$/, "")).filter(Boolean) as string[];
    const vanligst = [...new Set(symboler)].sort((a, b) => symboler.filter((x) => x === b).length - symboler.filter((x) => x === a).length)[0] ?? "";
    return {
      dato,
      min: Math.round(Math.min(...temp)),
      maks: Math.round(Math.max(...temp)),
      nedbor: Math.round(nedbor * 10) / 10,
      vind: Math.round(Math.max(...s.map((x) => x.data.instant.details.wind_speed))),
      symbol: vanligst,
    };
  });
  const sisteVarsel = steg.length ? lokal.format(new Date(steg[steg.length - 1]!.time)) : "";
  return { sted, dager: dager.sort((a, b) => a.dato.localeCompare(b.dato)), utenforVarsel: !sisteVarsel || til > sisteVarsel };
}

const SYMBOL: [RegExp, string][] = [
  [/^heavysnow/, "mye snø"],
  [/^lightsnow/, "lett snø"],
  [/snow/, "snø"],
  [/sleet/, "sludd"],
  [/^heavyrain/, "kraftig regn"],
  [/^lightrain/, "lett regn"],
  [/rainshowers/, "regnbyger"],
  [/rain/, "regn"],
  [/thunder/, "torden"],
  [/fog/, "tåke"],
  [/^clearsky/, "klart"],
  [/^fair/, "lettskyet"],
  [/^partlycloudy/, "delvis skyet"],
  [/^cloudy/, "skyet"],
];

/** «klart», «lett snø» … */
export function symbolTekst(symbol: string): string {
  return SYMBOL.find(([r]) => r.test(symbol))?.[1] ?? "";
}

/**
 * Stedet ut fra teksten om turen, når «Hvor» står tomt: «Hytta på Hafjell» → Hafjell.
 * Ord med stor forbokstav etter «på», «i», «til» osv. prøves først, så andre ord med stor forbokstav som ikke starter en setning.
 * `unnta` er navn som ikke er steder (personene i husstanden).
 */
export async function finnStedITekst(tekst: string, unnta: string[] = []): Promise<Sted | null> {
  const ord = "[A-ZÆØÅ][a-zæøåéü-]+(?:\\s+[A-ZÆØÅ][a-zæøåéü-]+)?";
  const etterPreposisjon = [...tekst.matchAll(new RegExp(`\\b(?:på|i|til|ved|hos|mot|fra|over)\\s+(${ord})`, "g"))].map((m) => m[1]!);
  const andre = [...tekst.matchAll(new RegExp(`(?<![.!?]\\s|^)(?<=\\s)(${ord})`, "g"))].map((m) => m[1]!);
  const nei = new Set(unnta.map((n) => n.toLowerCase()));
  const kandidater = [...new Set([...etterPreposisjon, ...andre])].filter((k) => !nei.has(k.toLowerCase().split(/\s+/)[0]!)).slice(0, 4);
  for (const k of kandidater) {
    const sted = await finnSted(k);
    if (sted) return sted;
  }
  return null;
}
