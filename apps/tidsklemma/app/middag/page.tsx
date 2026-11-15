import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { iDag, leggTilDager } from "../dato";
import { DatabaseFeil } from "../database-feil";
import { hentHusstand } from "../planter/data";
import { Side } from "../side";
import { startPaNytt, velgRett } from "./actions";
import { agentKlar } from "./agent/start";
import { butikkNavn } from "./butikker";
import { hentInnstillinger, hentMeny, hentOppskrifter, hentSisteBestilling, hentTilbudFraDb, UKEDAGER } from "./data";
import { valgteInnkjop, valgteRetter } from "./meny";
import { prisoversikt } from "./pris";
import { Oppdater } from "./oppdater";
import { merkSett } from "./status";
import { dagTekst, mandagI, middagsdager, standardUke, ukeNr, ukeTekst } from "./uke";

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
  // Den røde prikken på Middag-flisen forsvinner når du har sett menyen.
  if (meny) await merkSett(supabase, meny.id).catch(() => {});
  const favoritter = oppskrifter.filter((o) => o.favoritt).length;
  const naa = new Date().toISOString();
  const gyldige = tilbud.filter((t) => t.gyldig_til >= naa).length;
  const venter = bestilling && (bestilling.status === "venter" || bestilling.status === "jobber") && (!meny || bestilling.created_at > meny.laget_at);
  const feilet = bestilling?.status === "feil" && (!meny || bestilling.created_at > meny.laget_at);
  const retter = meny ? valgteRetter(meny) : [];
  const navnPa = new Map(oppskrifter.map((o) => [o.id, o.navn]));
  // Er det dager igjen å lage meny for? På søndag er «denne uka» som regel over.
  const igjen = middagsdager(uke, inn.dager).length > 0;
  const sum = meny ? prisoversikt(valgteInnkjop(meny), inn.butikker, inn.maks_butikker, meny.valg.fordeling) : null;

  const menyInnhold = meny && (
    <>
      {meny.data.merknad && <p className="dempet">{meny.data.merknad}</p>}
      <ul className="mdager">
        {retter.map((r) => {
          if (r.type === "fri")
            return (
              <li key={r.dag.dato} id={r.dag.dato} className="mdag">
                <p className="kt">{dagTekst(r.dag.dato)}</p>
                <span className="mrett mfri">Ingen middag</span>
                <small className="dempet">Rester, middag ute eller noe annet</small>
                <form action={velgRett}>
                  <input type="hidden" name="uke" value={uke} />
                  <input type="hidden" name="dato" value={r.dag.dato} />
                  <input type="hidden" name="valg" value={`alt:0`} />
                  <button type="submit" className="inline-knapp">
                    Lag middag likevel
                  </button>
                </form>
              </li>
            );
          const egen = r.type === "egen";
          const navn = egen ? (navnPa.get(r.oppskrift_id) ?? "Egen oppskrift") : r.alt.navn;
          const oppskriftId = egen ? r.oppskrift_id : r.alt.oppskrift_id;
          return (
            <li key={r.dag.dato} id={r.dag.dato} className="mdag">
              <p className="kt">
                {dagTekst(r.dag.dato)} · {r.dag.personer} pers.
              </p>
              {navnPa.has(oppskriftId) ? (
                <Link href={`/middag/oppskrifter/${oppskriftId}`} className="mrett">
                  {navn}
                </Link>
              ) : (
                // Oppskriften er slettet fra kokeboka etter at menyen ble laget.
                <span className="mrett">{navn}</span>
              )}
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
                    <input type="radio" name="valg" value="fri" />
                    <span>Ingen middag (rester, ute e.l.)</span>
                  </label>
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
            {sum?.aktiv && ` · ca. ${kroner.format(sum.aktiv.sum)} kr`}
          </b>
          {sum?.aktiv && (
            <small className="dempet">
              {sum.aktiv.butikker.length > 1 ? `Fordelt på ${sum.aktiv.butikker.map(butikkNavn).join(" og ")}` : `Alt hos ${butikkNavn(sum.aktiv.butikker[0]!)}`}
              {sum.billigst && sum.aktiv.sum - sum.billigst.sum >= 1 && ` · ${kroner.format(sum.aktiv.sum - sum.billigst.sum)} kr dyrere enn billigst`}
            </small>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </Link>
    </>
  );

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
        <div className="kort mplanlegges" role="status">
          <Oppdater />
          <p className="kt">Under planlegging</p>
          <p>
            {meny ? "En ny ukesplan lages og erstatter den gamle." : "Ukesplanen lages."} Bestilt {tid.format(new Date(bestilling!.created_at))}.{" "}
            {agentKlar() ? "Den er klar om noen minutter, og du får et varsel." : "Den lages søndag kveld, når agenten kjører fast."}
          </p>
          {agentKlar() && Date.now() - new Date(bestilling!.created_at).getTime() > 20 * 60_000 && (
            <form action={startPaNytt}>
              <input type="hidden" name="uke" value={uke} />
              <button type="submit" className="inline-knapp">
                Det tar lang tid. Prøv igjen
              </button>
            </form>
          )}
        </div>
      )}
      {feilet && (
        <div className="kort stiplet">
          <p className="kt">Det gikk ikke å lage menyen</p>
          <p>{bestilling!.melding ?? "Prøv igjen litt senere."}</p>
        </div>
      )}

      {meny &&
        (venter ? (
          <details className="mgammel">
            <summary>Vis forrige ukesplan</summary>
            {menyInnhold}
          </details>
        ) : (
          menyInnhold
        ))}
      {!meny && !venter && (
        <div className="kort stiplet">
          {igjen ? (
            <>
              <p className="kt">Ingen meny ennå</p>
              <p>Lag en meny for uka. Den velger blant oppskriftene deres ut fra tilbudene.</p>
            </>
          ) : (
            <>
              <p className="kt">Uka er snart over</p>
              <p>
                Det er ingen middagsdager igjen denne uka. <Link href={`/middag?uke=${neste}`}>Planlegg neste uke ›</Link>
              </p>
            </>
          )}
        </div>
      )}

      {!venter && igjen && (
        <Link href={`/middag/planlegg?uke=${uke}`} className={meny ? "sekundar mlag" : "primar"}>
          {meny ? "Lag ny meny" : "Lag meny"} for {ukeNr(uke).toLowerCase()}
        </Link>
      )}

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
