import type { Alternativ, Dag, Innkjop, MenyData, Pris } from "../meny";

/**
 * Sjekker menyen agenten sender før den lagres. Gir tilbake en ren kopi (ukjente felt fjernet),
 * eller en liste over feil agenten kan rette og prøve igjen med.
 */
export function sjekkMeny(inn: unknown): { meny: MenyData; feil: [] } | { meny: null; feil: string[] } {
  const feil: string[] = [];
  const tekst = (v: unknown, hvor: string, maks: number, valgfri = false): string | undefined => {
    if (v == null && valgfri) return undefined;
    if (typeof v !== "string" || !v.trim() || v.length > maks) {
      feil.push(`${hvor} må være tekst på 1–${maks} tegn`);
      return undefined;
    }
    return v.trim();
  };
  const tall = (v: unknown, hvor: string, min: number, maks: number): number | null => {
    if (v == null) return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > maks) {
      feil.push(`${hvor} må være et tall mellom ${min} og ${maks}`);
      return null;
    }
    return Math.round(v * 100) / 100;
  };
  const m = inn as Partial<Record<keyof MenyData, unknown>> | null;
  if (!m || typeof m !== "object") return { meny: null, feil: ["meny må være et objekt med dager og innkjop"] };

  const innkjop: Innkjop[] = [];
  if (!Array.isArray(m.innkjop) || m.innkjop.length > 80) feil.push("innkjop må være en liste med høyst 80 varer");
  else
    m.innkjop.forEach((x: Record<string, unknown>, n) => {
      const hvor = `innkjop[${n}]`;
      const id = tekst(x?.id, `${hvor}.id`, 40);
      if (id && innkjop.some((i) => i.id === id)) feil.push(`${hvor}.id «${id}» er brukt før`);
      const priser: Record<string, Pris> = {};
      if (x?.priser != null && (typeof x.priser !== "object" || Array.isArray(x.priser))) feil.push(`${hvor}.priser må være et objekt med butikk-koder`);
      else
        for (const [butikk, p] of Object.entries((x?.priser ?? {}) as Record<string, Record<string, unknown>>)) {
          if (!/^[A-Z0-9_]{2,40}$/.test(butikk)) feil.push(`${hvor}.priser: ukjent butikk-kode «${butikk}»`);
          const pris = tall(p?.pris, `${hvor}.priser.${butikk}.pris`, 0, 10000);
          if (pris == null) {
            if (p?.pris == null) feil.push(`${hvor}.priser.${butikk}.pris mangler`);
            continue;
          }
          priser[butikk] = { pris, ...(p.tilbud === true && { tilbud: true }), ...(typeof p.vare === "string" && { vare: p.vare.slice(0, 200) }) };
        }
      const navn = tekst(x?.navn, `${hvor}.navn`, 120);
      const bruk = tekst(x?.bruk, `${hvor}.bruk`, 200, true);
      const rest = tekst(x?.rest, `${hvor}.rest`, 200, true);
      if (id && navn)
        innkjop.push({ id, navn, ...(bruk && { bruk }), ...(rest && { rest }), priser, referanse: tall(x?.referanse, `${hvor}.referanse`, 0, 10000) });
    });

  const dager: Dag[] = [];
  if (!Array.isArray(m.dager) || m.dager.length === 0 || m.dager.length > 7) feil.push("dager må være en liste med 1–7 dager");
  else
    m.dager.forEach((d: Record<string, unknown>, n) => {
      const hvor = `dager[${n}]`;
      const dato = typeof d?.dato === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.dato) ? d.dato : (feil.push(`${hvor}.dato må være ÅÅÅÅ-MM-DD`), "");
      if (dato && dager.some((x) => x.dato === dato)) feil.push(`${hvor}.dato ${dato} er med to ganger`);
      const personer = tall(d?.personer, `${hvor}.personer`, 1, 40);
      if (personer == null) feil.push(`${hvor}.personer mangler`);
      const alternativer: Alternativ[] = [];
      if (!Array.isArray(d?.alternativer) || d.alternativer.length < 1 || d.alternativer.length > 3) feil.push(`${hvor}.alternativer må ha 1–3 retter`);
      else
        d.alternativer.forEach((a: Record<string, unknown>, k) => {
          const h = `${hvor}.alternativer[${k}]`;
          const oppskrift_id = typeof a?.oppskrift_id === "string" && /^[0-9a-f-]{36}$/.test(a.oppskrift_id) ? a.oppskrift_id : (feil.push(`${h}.oppskrift_id må være en oppskrift-id`), "");
          const navn = tekst(a?.navn, `${h}.navn`, 200);
          const begrunnelse = tekst(a?.begrunnelse, `${h}.begrunnelse`, 200, true);
          const tilpasninger = Array.isArray(a?.tilpasninger) ? a.tilpasninger.filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 5).map((t) => t.slice(0, 200)) : [];
          const bruker = Array.isArray(a?.bruker) ? a.bruker.filter((b): b is string => typeof b === "string") : (feil.push(`${h}.bruker må være en liste med innkjop-id-er`), []);
          for (const b of bruker) if (!innkjop.some((i) => i.id === b)) feil.push(`${h}.bruker: fant ikke innkjop «${b}»`);
          const minutter = tall(a?.minutter, `${h}.minutter`, 1, 1440);
          if (oppskrift_id && navn)
            alternativer.push({ oppskrift_id, navn, ...(begrunnelse && { begrunnelse }), ...(tilpasninger.length && { tilpasninger }), minutter, bruker: [...new Set(bruker)] });
        });
      if (dato && personer != null) dager.push({ dato, personer: Math.round(personer), alternativer, ...(d?.fri === true && { fri: true }) });
    });

  const merknad = tekst(m.merknad, "merknad", 500, true);
  if (feil.length) return { meny: null, feil: feil.slice(0, 30) };
  dager.sort((a, b) => a.dato.localeCompare(b.dato));
  return { meny: { dager, innkjop, ...(merknad && { merknad }) }, feil: [] };
}
