/** Leser en oppskrift fra en nettside, fra dataene oppskriftssidene legger ut for Google (schema.org Recipe). */

export type LestOppskrift = {
  navn: string;
  ingredienser: string[];
  fremgangsmaate: string;
  minutter: number | null;
  porsjoner: number | null;
  bilde: string | null;
};

type Node = Record<string, unknown>;

function liste<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function noder(html: string): Node[] {
  const ut: Node[] = [];
  const besok = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(besok);
    if (v && typeof v === "object") {
      ut.push(v as Node);
      const g = (v as Node)["@graph"];
      if (g) besok(g);
    }
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      besok(JSON.parse(m[1]!.trim()));
    } catch {
      // Ødelagt blokk: hopp over.
    }
  }
  return ut;
}

function rens(tekst: unknown): string {
  return String(tekst ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** «PT1H30M» → 90. */
export function minutterFra(varighet: unknown): number | null {
  const m = String(varighet ?? "").match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m || (!m[1] && !m[2])) return null;
  const min = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return min > 0 ? min : null;
}

/** «8 PORSJONER», «4», ["4", "4 porsjoner"] → 8 / 4. */
function porsjonerFra(v: unknown): number | null {
  for (const x of liste(v as unknown[])) {
    const n = String(x).match(/\d+/);
    if (n) return Number(n[0]);
  }
  return null;
}

/** Steg kan være tekst, HowToStep eller HowToSection med steg inni. */
function steg(v: unknown): string[] {
  if (typeof v === "string") return [rens(v)].filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(steg);
  if (v && typeof v === "object") {
    const n = v as Node;
    if (n.itemListElement) {
      const tittel = rens(n.name);
      const under = steg(n.itemListElement);
      return tittel ? [`${tittel}:`, ...under] : under;
    }
    return [rens(n.text ?? n.name)].filter(Boolean);
  }
  return [];
}

function bilde(v: unknown, base: string): string | null {
  const forste = liste(v as unknown[])[0];
  const src = typeof forste === "string" ? forste : ((forste as Node | undefined)?.url as string | undefined);
  if (!src) return null;
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

export function lesOppskrift(html: string, url: string): LestOppskrift | null {
  const r = noder(html).find((n) => liste(n["@type"] as string | string[]).some((t) => String(t) === "Recipe"));
  if (!r) return null;
  const navn = rens(r.name);
  if (!navn) return null;
  return {
    navn,
    ingredienser: liste(r.recipeIngredient as string[]).map(rens).filter(Boolean),
    fremgangsmaate: steg(r.recipeInstructions).join("\n"),
    minutter: minutterFra(r.totalTime) ?? minutterFra(r.cookTime) ?? null,
    porsjoner: porsjonerFra(r.recipeYield),
    bilde: bilde(r.image, url),
  };
}

/** Tittelen på siden, til oppskrifter vi ikke klarte å lese. */
export function sideTittel(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const t = og ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return t ? rens(t).slice(0, 200) : null;
}

export async function hentSide(url: string): Promise<string | null> {
  try {
    const svar = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Tidsklemma/1.0)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return svar.ok ? await svar.text() : null;
  } catch {
    return null;
  }
}
