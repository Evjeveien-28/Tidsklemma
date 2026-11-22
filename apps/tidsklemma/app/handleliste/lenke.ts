import { hentTrygt } from "../middag/trygg-henting";

/** «https://…» eller null. Bare vanlige nettadresser, ikke javascript: eller data:. */
export function gyldigLenke(tekst: string): string | null {
  const t = tekst.trim();
  // «ikea.no/produkt» uten https:// foran.
  const medSkjema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(t) ? `https://${t}` : t;
  try {
    const u = new URL(medSkjema);
    return (u.protocol === "https:" || u.protocol === "http:") && u.href.length <= 2000 ? u.href : null;
  } catch {
    return null;
  }
}

const attr = (tagg: string, navn: string) => tagg.match(new RegExp(`${navn}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];

/**
 * Bildet siden selv har valgt for deling (og:image, twitter:image eller image_src), som et miniatyrbilde.
 * Siden hentes bare hvis den er en vanlig offentlig nettside (se trygg-henting.ts). Null hvis ikke noe bilde.
 */
export function finnDelingsbilde(html: string, base: string): string | null {
  const metaer = html.match(/<meta\b[^>]*>/gi) ?? [];
  const kandidater = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"];
  for (const navn of kandidater) {
    const tagg = metaer.find((m) => (attr(m, "property") ?? attr(m, "name"))?.toLowerCase() === navn);
    const src = tagg && attr(tagg, "content");
    if (src) {
      const url = gyldigLenke(new URL(src.replace(/&amp;/g, "&"), base).href);
      if (url) return url;
    }
  }
  const lenke = (html.match(/<link\b[^>]*>/gi) ?? []).find((l) => attr(l, "rel")?.toLowerCase() === "image_src");
  const href = lenke && attr(lenke, "href");
  return href ? gyldigLenke(new URL(href, base).href) : null;
}

export async function hentDelingsbilde(lenke: string): Promise<string | null> {
  const html = await hentTrygt(lenke);
  if (!html) return null;
  try {
    return finnDelingsbilde(html, lenke);
  } catch {
    return null;
  }
}
