import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { iDag, leggTilDager } from "../dato";
import { DatabaseFeil } from "../database-feil";
import { hentHusstand } from "../planter/data";
import { Side } from "../side";
import { velgRett } from "./actions";
import { butikkNavn } from "./butikker";
import { hentInnstillinger, hentMeny, hentOppskrifter, hentSisteBestilling, hentTilbudFraDb, UKEDAGER } from "./data";
import { valgteInnkjop, valgteRetter } from "./meny";
import { prisoversikt } from "./pris";
import { dagTekst, mandagI, standardUke, ukeTekst } from "./uke";

const tilbake = { href: "/", navn: "Tilbake" };
const tid = new Intl.DateTimeFormat("nb-NO", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
const kroner = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

export default async function Middag({ searchParams }: { searchParams: Promise<{ uke?: string }> }) {
  const sok = await searchParams;
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) {
    return (
      <Side tittel="Middag" tilbake={tilbake}>
        <p>Du er ikke medlem av en husstand ennå.</p>
      </Side>
    );
  }
  const denne = mandagI(iDag());
  const neste = leggTilDager(denne, 7);
  const uke = sok.uke === denne || sok.uke === neste ? sok.uke : standardUke();

  let oppskrifter, inn, tilbud, meny, bestilling;
  try {
    [oppskrifter, inn, tilbud, meny, bestilling] = await Promise.all([
      hentOppskrifter(supabase, husstand.id),
      hentInnstillinger(supabase, husstand.id),
      hentTilbudFraDb(supabase, husstand.id).catch(() => []),
      hentMeny(supabase, husstand.id, uke),
      hentSisteBestilling(supabase, husstand.id, uke),
    ]);
  } catch (e) {
    return (
      <Side tittel="Middag" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="middag" schema="middag" tabeller="middag-tabellene" />
      </Side>
    );
  }
  const favoritter = oppskrifter.filter((o) => o.favoritt).length;
  const naa = new Date().toISOString();
  const gyldige = tilbud.filter((t) => t.gyldig_til >= naa).length;
  const venter = bestilling && (bestilling.status === "venter" || bestilling.status === "jobber") && (!meny || bestilling.created_at > meny.laget_at);
  const feilet = bestilling?.status === "feil" && (!meny || bestilling.created_at > meny.laget_at);
  const retter = meny ? valgteRetter(meny) : [];
  const navnPa = new Map(oppskrifter.map((o) => [o.id, o.navn]));
  const sum = meny ? prisoversikt(valgteInnkjop(meny), inn.butikker, inn.maks_butikker, inn.min_besparelse) : null;

  return (
    <Side tittel="Middag" tilbake={tilbake}>
      <nav className="segment" aria-label="Uke">
        <Link href={`/middag?uke=${denne}`} aria-current={uke === denne ? "page" : undefined}>
          Denne uka
        </Link>
        <Link href={`/middag?uke=${neste}`} aria-current={uke === neste ? "page" : undefined}>
          Neste uke
        </Link>
      </nav>
      <p className="dempet liten" style={{ marginTop: -6 }}>
        {ukeTekst(uke)}
      </p>

      {venter && (
        <div className="kort stiplet">
          <p className="kt">Menyen lages</p>
          <p>Bestilt {tid.format(new Date(bestilling!.created_at))}. Den er klar innen en time.</p>
        </div>
      )}
      {feilet && (
        <div className="kort stiplet">
          <p className="kt">Det gikk ikke å lage menyen</p>
          <p>{bestilling!.melding ?? "Prøv igjen litt senere."}</p>
        </div>
      )}

      {meny ? (
        <>
          {meny.data.merknad && <p className="dempet">{meny.data.merknad}</p>}
          <ul className="mdager">
            {retter.map((r) => {
              const egen = r.type === "egen";
              const navn = egen ? (navnPa.get(r.oppskrift_id) ?? "Egen oppskrift") : r.alt.navn;
              const oppskriftId = egen ? r.oppskrift_id : r.alt.oppskrift_id;
              return (
                <li key={r.dag.dato} id={r.dag.dato} className="mdag">
                  <p className="kt">
                    {dagTekst(r.dag.dato)} · {r.dag.personer} pers.
                  </p>
                  <Link href={`/middag/oppskrifter/${oppskriftId}`} className="mrett">
                    {navn}
                  </Link>
                  {!egen && r.alt.begrunnelse && <small className="mgrunn">{r.alt.begrunnelse}</small>}
                  {!egen && r.alt.tilpasninger?.map((t) => (
                    <small key={t} className="mtilpass">
                      {t}
                    </small>
                  ))}
                  {egen && <small className="dempet">Egen oppskrift, prisen anslås når den sendes til handlelisten</small>}
                  <details className="mbytt">
                    <summary className="inline-knapp">Bytt</summary>
                    <form action={velgRett}>
                      <input type="hidden" name="uke" value={uke} />
                      <input type="hidden" name="dato" value={r.dag.dato} />
                      {r.dag.alternativer.map((a, i) => (
                        <label key={i} className="radio">
                          <input type="radio" name="valg" value={`alt:${i}`} defaultChecked={!egen && r.indeks === i} />
                          <span>
                            <b>{a.navn}</b>
                            {a.begrunnelse && <small className="dempet"> – {a.begrunnelse}</small>}
                          </span>
                        </label>
                      ))}
                      <label className="radio">
                        <input type="radio" name="valg" value="egen" defaultChecked={egen} />
                        <span>Egen oppskrift:</span>
                      </label>
                      <select
                        name="egen"
                        className="felt"
                        defaultValue={egen ? r.oppskrift_id : ""}
                        aria-label="Velg egen oppskrift"
                      >
                        <option value="">Velg …</option>
                        {oppskrifter.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.favoritt ? "★ " : ""}
                            {o.navn}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="sekundar">
                        Bruk
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>

          <Link href={`/middag/handleliste?uke=${uke}`} className="kort mhandel">
            <span>
              <span className="kt">Handleliste for uka</span>
              <b>
                {valgteInnkjop(meny).length} varer
                {sum?.billigst && ` · ca. ${kroner.format(sum.billigst.sum)} kr hos ${butikkNavn(sum.billigst.butikker[0]!)}`}
              </b>
              {sum?.fordelt && (
                <small className="dempet">
                  Eller ca. {kroner.format(sum.fordelt.sum)} kr fordelt på {sum.fordelt.butikker.map(butikkNavn).join(" og ")}
                </small>
              )}
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </>
      ) : (
        !venter && (
          <div className="kort stiplet">
            <p className="kt">Ingen meny ennå</p>
            <p>Lag en meny for uka. Den velger blant oppskriftene deres ut fra tilbudene.</p>
          </div>
        )
      )}

      <Link href={`/middag/planlegg?uke=${uke}`} className={meny ? "sekundar mlag" : "primar"}>
        {meny ? "Lag ny meny" : "Lag meny"}
      </Link>

      <nav className="meg-meny" aria-label="Middag" style={{ marginTop: 18 }}>
        <Link href="/middag/oppskrifter" className="meg-lenke">
          <span>
            Oppskrifter
            <small className="dempet liten" style={{ display: "block" }}>
              {oppskrifter.length === 0
                ? "Ingen ennå"
                : `${oppskrifter.length} ${oppskrifter.length === 1 ? "oppskrift" : "oppskrifter"}${favoritter ? `, ${favoritter} med stjerne` : ""}`}
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/middag/tilbud" className="meg-lenke">
          <span>
            Ukens tilbud
            <small className="dempet liten" style={{ display: "block" }}>
              {!inn.lat ? "Legg inn postnummer i innstillingene" : gyldige ? `${gyldige} tilbud i nærheten av ${inn.sted ?? inn.postnummer}` : "Hentes i natt"}
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/middag/innstillinger" className="meg-lenke">
          <span>
            Innstillinger
            <small className="dempet liten" style={{ display: "block" }}>
              {inn.dager.length === 7 ? "Alle dager" : inn.dager.map((d) => UKEDAGER[d - 1]).join(", ")} · {inn.butikker.map(butikkNavn).join(", ")}
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      </nav>
    </Side>
  );
}
