import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../../database-feil";
import { hentHusstand } from "../../planter/data";
import { Side } from "../../side";
import { hentTilbudNa } from "../actions";
import { Bilde } from "../bilde";
import { butikkNavn } from "../butikker";
import { hentInnstillinger, hentTilbudFraDb, type Innstillinger, type Tilbud } from "../data";
import { HentKnapp } from "./hent-knapp";

const kr = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });
const ore = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «149» eller «9,90». */
const pris = (n: number) => (Number.isInteger(n) ? kr.format(n) : ore.format(n));
const dag = new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Oslo" });
const tid = new Intl.DateTimeFormat("nb-NO", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });

const feiltekst: Record<string, string> = {
  sted: "Legg inn postnummer i innstillingene først, så vi vet hvilke butikker som er i nærheten.",
  tomt: "Fant ingen tilbud akkurat nå. Prøv igjen litt senere.",
  lagre: "Det gikk ikke å lagre tilbudene. Prøv igjen.",
};

function mengde(t: Tilbud) {
  if (t.mengde_fra == null || !t.enhet || t.enhet === "pcs") return null;
  const m = t.mengde_fra === t.mengde_til || t.mengde_til == null ? kr.format(t.mengde_fra) : `${kr.format(t.mengde_fra)}–${kr.format(t.mengde_til)}`;
  return `${m} ${t.enhet}`;
}

export default async function UkensTilbud({ searchParams }: { searchParams: Promise<{ butikk?: string; q?: string; feil?: string }> }) {
  const { butikk, q, feil } = await searchParams;
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  const tilbake = { href: "/middag", navn: "Middag" };
  if (!husstand) return <Side tittel="Ukens tilbud" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;
  let inn: Innstillinger, tilbud: Tilbud[];
  try {
    [inn, tilbud] = await Promise.all([hentInnstillinger(supabase, husstand.id), hentTilbudFraDb(supabase, husstand.id)]);
  } catch (e) {
    return (
      <Side tittel="Ukens tilbud" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="tilbudene" schema="middag" tabeller="middag.tilbud" />
      </Side>
    );
  }

  const na = new Date().toISOString();
  const gyldige = tilbud.filter((t) => t.gyldig_til >= na);
  const valgt = butikk && inn.butikker.includes(butikk) ? butikk : null;
  const sok = (q ?? "").trim().toLowerCase();
  const rang = (k: string) => (inn.butikker.indexOf(k) + 1 || 99);
  const rabatt = (t: Tilbud) => (t.forpris && t.forpris > t.pris ? (t.forpris - t.pris) / t.forpris : 0);
  const vis = gyldige
    .filter((t) => (!valgt || t.butikk === valgt) && (!sok || `${t.navn} ${t.beskrivelse}`.toLowerCase().includes(sok)))
    .sort((a, b) => rang(a.butikk) - rang(b.butikk) || rabatt(b) - rabatt(a) || a.navn.localeCompare(b.navn, "nb"));
  const hentet = tilbud.map((t) => t.hentet_at).sort().at(-1);
  const lenke = (b: string | null) => `/middag/tilbud?${new URLSearchParams({ ...(b ? { butikk: b } : {}), ...(sok ? { q: sok } : {}) })}`;

  return (
    <Side tittel="Ukens tilbud" tilbake={tilbake}>
      {feil && <p className="feil">{feiltekst[feil] ?? feiltekst.lagre}</p>}
      {!inn.lat ? (
        <div className="kort stiplet">
          <p className="kt">Mangler sted</p>
          <p>Legg inn postnummer under innstillingene, så hentes tilbud fra butikkene i nærheten.</p>
          <Link href="/middag/innstillinger" className="inline-knapp">
            Til innstillingene ›
          </Link>
        </div>
      ) : (
        <>
          <p className="dempet liten" style={{ marginTop: 0 }}>
            {gyldige.length} tilbud fra butikker innen 2 mil fra {inn.sted ?? inn.postnummer}.{hentet && ` Hentet ${tid.format(new Date(hentet))}.`}
          </p>
          <nav className="merkelapp-filter" aria-label="Butikk">
            <Link href={lenke(null)} className="merkelapp" aria-current={valgt ? undefined : "page"}>
              Alle
            </Link>
            {inn.butikker.map((b) => (
              <Link key={b} href={lenke(b)} className="merkelapp" aria-current={valgt === b ? "page" : undefined}>
                {butikkNavn(b)} ({gyldige.filter((t) => t.butikk === b).length})
              </Link>
            ))}
          </nav>
          <form className="tid-rad" style={{ marginBottom: 12 }}>
            {valgt && <input type="hidden" name="butikk" value={valgt} />}
            <label htmlFor="q" className="visuelt-skjult">
              Søk i tilbudene
            </label>
            <input id="q" name="q" type="search" defaultValue={sok} placeholder="Søk, f.eks. kylling" className="felt" />
            <button type="submit" className="inline-knapp">
              Søk
            </button>
          </form>

          {vis.length === 0 ? (
            <div className="kort stiplet">
              <p>{gyldige.length === 0 ? "Ingen tilbud hentet ennå. De hentes hver natt, eller du kan hente nå." : "Ingen treff."}</p>
            </div>
          ) : (
            <ul className="tliste">
              {vis.slice(0, 300).map((t) => (
                <li key={t.id} className="trad">
                  <span className="tbilde">
                    <Bilde src={t.bilde_url} />
                  </span>
                  <span className="pt">
                    <b>{t.navn.charAt(0) + t.navn.slice(1).toLowerCase()}</b>
                    <small>{[butikkNavn(t.butikk), mengde(t), `til ${dag.format(new Date(t.gyldig_til))}`].filter(Boolean).join(" · ")}</small>
                    {t.beskrivelse && <small className="tbeskrivelse">{t.beskrivelse}</small>}
                  </span>
                  <span className="tpris">
                    <b>{pris(t.pris)}</b>
                    {t.forpris && t.forpris > t.pris && <s>{pris(t.forpris)}</s>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {vis.length > 300 && <p className="dempet liten">Viser de 300 første. Søk eller velg butikk for å se flere.</p>}
        </>
      )}

      {inn.lat && (
        <form action={hentTilbudNa} className="bunnknapper">
          <HentKnapp />
        </form>
      )}
    </Side>
  );
}
