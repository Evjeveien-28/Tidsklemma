import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../../husstand/personer";
import { Side } from "../../side";
import { iDag } from "../../dato";
import { Oppdater } from "../../middag/oppdater";
import { bestillForslag, lasTur, leggTil, nullstillPakket } from "../actions";
import { finnSted, hentVaer, symbolTekst, type Vaer } from "../vaer";
import { hentTing, hentTur, netter, periode } from "../data";
import { PakkListe, type Gruppe } from "../liste";

const ukedag = new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** Været på stedet, når turen er innenfor varselet (ca. ti dager frem). Null ellers, eller hvis stedet ikke finnes. */
async function vaerFor(sted: string, fra: string, til: string): Promise<Vaer | null> {
  const idag = iDag();
  const dagerTil = (Date.parse(`${fra}T12:00:00Z`) - Date.parse(`${idag}T12:00:00Z`)) / 86_400_000;
  if (!sted || til < idag || dagerTil > 10) return null;
  try {
    const s = await finnSted(sted);
    return s ? await hentVaer(s, fra < idag ? idag : fra, til) : null;
  } catch {
    return null;
  }
}

export default async function TurSide({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feil?: string }> }) {
  const [{ id }, { feil }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const tur = await hentTur(supabase, id);
  if (!tur) notFound();
  const [personer, ting, vaer] = await Promise.all([hentPersoner(supabase, tur.household_id), hentTing(supabase, id), vaerFor(tur.sted, tur.fra, tur.til)]);
  const lager = tur.forslag_status === "venter" || tur.forslag_status === "jobber";
  const med = personer.filter((p) => tur.personer.includes(p.id));
  const laast = Boolean(tur.laast_at);

  // En gruppe per person som er med, felles til slutt. Ting til noen som ikke lenger er med, havner på felles.
  const rad = (t: (typeof ting)[number]) => ({ id: t.id, navn: t.navn, antall: t.antall, pakket: Boolean(t.pakket_at), agent: t.kilde === "agent" });
  const grupper: Gruppe[] = [
    ...med.map((p) => ({ id: p.id, navn: p.navn, farge: p.farge, rader: ting.filter((t) => t.person_id === p.id).map(rad) })),
    { id: "felles", navn: "Felles", farge: null, rader: ting.filter((t) => !t.person_id || !tur.personer.includes(t.person_id)).map(rad) },
  ];
  const pakket = ting.filter((t) => t.pakket_at).length;
  const endre = (
    <Link href={`/pakkeliste/${id}/endre`} className="inline-knapp" style={{ minHeight: 0 }}>
      Endre
    </Link>
  );

  return (
    <Side tittel={tur.tittel} tilbake={{ href: "/pakkeliste", navn: "Pakkeliste" }} handling={endre}>
      <p className="dempet" style={{ marginTop: 0 }}>
        {[periode(tur.fra, tur.til), netter(tur.fra, tur.til), tur.sted, laast && "Låst"].filter(Boolean).join(" · ")}
      </p>
      {tur.beskrivelse && <p className="pk-beskrivelse">{tur.beskrivelse}</p>}

      {vaer && vaer.dager.length > 0 && (
        <div className="kort pk-vaer">
          <p className="kt">
            Været på {vaer.sted.navn}
            {vaer.sted.land !== "Norge" && `, ${vaer.sted.land}`}
          </p>
          <ul>
            {vaer.dager.map((d) => (
              <li key={d.dato}>
                <span>{ukedag.format(new Date(`${d.dato}T12:00:00Z`))}</span>
                <b>
                  {d.min === d.maks ? d.maks : `${d.min} til ${d.maks}`} °C
                </b>
                <span className="dempet">{[symbolTekst(d.symbol), d.nedbor >= 1 && `${String(d.nedbor).replace(".", ",")} mm`].filter(Boolean).join(", ")}</span>
              </li>
            ))}
          </ul>
          <small className="dempet">Fra Meteorologisk institutt (yr).{vaer.utenforVarsel && " Varselet rekker ikke hele turen ennå."}</small>
        </div>
      )}

      {feil === "mange" && <p className="feil">Dere har bedt om mange forslag det siste døgnet. Vent litt før dere prøver igjen.</p>}
      {lager ? (
        <div className="kort mplanlegges" role="status">
          <Oppdater />
          <p className="kt">Agenten lager forslag</p>
          <p className="dempet liten">Den ser på turen, været og det dere har pakket før. Det dere har lagt til selv, blir stående.</p>
          {tur.forslag_bestilt_at && Date.now() - Date.parse(tur.forslag_bestilt_at) > 15 * 60_000 && (
            <form action={bestillForslag}>
              <input type="hidden" name="tur" value={id} />
              <button type="submit" className="inline-knapp">
                Det tar lang tid. Prøv igjen
              </button>
            </form>
          )}
        </div>
      ) : (
        tur.forslag_merknad && (
          <div className="kort pk-forslag">
            <p className={tur.forslag_status === "feil" ? "feil" : "pk-merknad"} style={{ margin: 0 }}>
              {tur.forslag_status === "feil" ? "Det gikk ikke å lage forslag: " : ""}
              {tur.forslag_merknad}
            </p>
            {tur.forslag_status === "feil" && !laast && (
              <form action={bestillForslag} style={{ marginTop: 8 }}>
                <input type="hidden" name="tur" value={id} />
                <button type="submit" className="inline-knapp">
                  Prøv igjen
                </button>
              </form>
            )}
          </div>
        )
      )}

      {ting.length > 0 && (
        <div className="pk-fremdrift" role="progressbar" aria-valuemin={0} aria-valuemax={ting.length} aria-valuenow={pakket} aria-label="Pakket">
          <span style={{ width: `${Math.round((pakket / ting.length) * 100)}%` }} />
          <small>
            {pakket} av {ting.length} pakket
          </small>
        </div>
      )}

      <PakkListe tur={id} grupper={grupper} laast={laast} />

      <form action={leggTil} className="kort pk-legg-til">
        <input type="hidden" name="tur" value={id} />
        <label htmlFor="navn" className="kt">
          Legg til
        </label>
        <input id="navn" name="navn" required maxLength={2000} placeholder="F.eks. ullundertøy, 3 sokker" autoComplete="off" className="felt" />
        <div className="knapperad">
          <select name="person" defaultValue={med[0]?.id ?? ""} className="felt" aria-label="Til hvem" style={{ margin: 0, flex: 1 }}>
            {med.map((p) => (
              <option key={p.id} value={p.id}>
                {p.navn}
              </option>
            ))}
            <option value="">Felles</option>
          </select>
          <button type="submit" className="sekundar">
            Legg til
          </button>
        </div>
      </form>

      <div className="kort pk-laas">
        {laast ? (
          <>
            <p className="kt">Pakkelisten er låst</p>
            <p className="dempet liten">Den blir husket til neste gang dere skal på en lignende tur. Lås opp for å fjerne ting.</p>
          </>
        ) : (
          <>
            <p className="kt">Er listen slik dere vil ha den?</p>
            <p className="dempet liten">Lås den, gjerne etter turen, så blir den husket til neste gang dere skal på en lignende tur.</p>
          </>
        )}
        <form action={lasTur}>
          <input type="hidden" name="tur" value={id} />
          <input type="hidden" name="pa" value={laast ? "0" : "1"} />
          <button type="submit" className={laast ? "inline-knapp" : "sekundar"}>
            {laast ? "Lås opp" : "Lås pakkelisten"}
          </button>
        </form>
      </div>

      {pakket > 0 && (
        <form action={nullstillPakket} style={{ textAlign: "center", marginTop: 8 }}>
          <input type="hidden" name="tur" value={id} />
          <button type="submit" className="lenke">
            Fjern alle kryss (f.eks. før hjemreisen)
          </button>
        </form>
      )}
    </Side>
  );
}
