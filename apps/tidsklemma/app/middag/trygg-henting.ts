import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Henting av sider brukerne lenker til. Serveren skal bare hente vanlige, offentlige nettsider:
 * ikke localhost, interne nettverk eller skyens metadata-adresser (SSRF), og ikke enorme filer.
 */

const MAKS_BYTES = 3_000_000;
const MAKS_OMDIRIGERINGER = 5;

function privatIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  );
}

export function privatIp(ip: string): boolean {
  if (isIP(ip) === 4) return privatIpv4(ip);
  const v6 = ip.toLowerCase();
  // IPv4 inne i IPv6, både «::ffff:127.0.0.1» og heksformen «::ffff:7f00:1» som URL gjør den om til.
  const mappet = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappet) return privatIpv4(mappet[1]!);
  const heks = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (heks) {
    const [h, l] = [parseInt(heks[1]!, 16), parseInt(heks[2]!, 16)];
    return privatIpv4(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`);
  }
  // Andre IPv4-varianter (::127.0.0.1, 64:ff9b::…) sperres for sikkerhets skyld.
  if (v6.startsWith("::") || v6.startsWith("64:ff9b")) return true;
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

/** Er adressen trygg å hente: http(s), vanlig port, og et vertsnavn som peker til offentlige adresser. */
export async function tryggAdresse(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  if (url.username || url.password) return false;
  const vert = url.hostname.replace(/^\[|\]$/g, "");
  if (vert === "localhost" || vert.endsWith(".localhost") || vert.endsWith(".internal") || vert.endsWith(".local")) return false;
  if (isIP(vert)) return !privatIp(vert);
  try {
    const adresser = await lookup(vert, { all: true });
    return adresser.length > 0 && adresser.every((a) => !privatIp(a.address));
  } catch {
    return false;
  }
}

/** Henter en HTML-side, med sjekk av hver omdirigering og en grense for størrelsen. Null hvis det ikke går. */
export async function hentTrygt(adresse: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return null;
  }
  for (let i = 0; i <= MAKS_OMDIRIGERINGER; i++) {
    if (!(await tryggAdresse(url))) return null;
    let svar: Response;
    try {
      svar = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Tidsklemma/1.0)", Accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      return null;
    }
    if (svar.status >= 300 && svar.status < 400) {
      const neste = svar.headers.get("location");
      if (!neste) return null;
      url = new URL(neste, url);
      continue;
    }
    if (!svar.ok || !svar.body) return null;
    const type = svar.headers.get("content-type") ?? "";
    if (type && !/html|xml|text/i.test(type)) return null;
    // Les høyst MAKS_BYTES, så en stor fil ikke fyller minnet.
    const leser = svar.body.getReader();
    const deler: Uint8Array[] = [];
    let lest = 0;
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      lest += value.byteLength;
      if (lest > MAKS_BYTES) {
        await leser.cancel();
        return null;
      }
      deler.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(deler));
  }
  return null;
}
