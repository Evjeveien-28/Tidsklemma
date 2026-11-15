import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../../database-feil";
import { alder, hentPersoner } from "../../husstand/personer";
import { hentHusstand } from "../../planter/data";
import { Side } from "../../side";
import { endreButikker, fjernAllergi, lagreInnstillinger, leggTilAllergi } from "../actions";
import { ButikkRekkefolge } from "../butikk-rekkefolge";
import { BUTIKKER } from "../butikker";
import { GRADER, HANDTERINGER, hentAllergier, hentInnstillinger, UKEDAGER } from "../data";

export default async function Innstillinger({ searchParams }: { searchParams: Promise<{ lagret?: string; feil?: string }> }) {
  const { lagret, feil } = await searchParams;
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  const tilbake = { href: "/middag", navn: "Middag" };
  if (!husstand) return <Side tittel="Innstillinger" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;
  let inn, allergier, personer;
  try {
    [inn, allergier, personer] = await Promise.all([
      hentInnstillinger(supabase, husstand.id),
      hentAllergier(supabase, husstand.id),
      hentPersoner(supabase, husstand.id),
    ]);
  } catch (e) {
    return (
      <Side tittel="Innstillinger" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="innstillingene" schema="middag" tabeller="middag-tabellene" />
      </Side>
    );
  }
  const navnPa = (id: string | null) => (id ? (personer.find((p) => p.id === id)?.navn ?? "?") : "Alle");
  const ledige = BUTIKKER.filter((b) => !inn.butikker.includes(b.kode));

  return (
    <Side tittel="Innstillinger" tilbake={tilbake}>
      {lagret && <p className="dempet">Lagret.</p>}
      {feil === "1" && <p className="feil">Det gikk ikke å lagre. Prøv igjen.</p>}

      <section className="kort">
        <p className="kt">Hvem spiser</p>
        <p style={{ margin: "2px 0 6px" }}>
          {personer.map((p) => `${p.navn}${alder(p) != null ? ` (${alder(p)})` : ""}`).join(", ")}
        </p>
        <p className="dempet liten" style={{ margin: 0 }}>
          Alle i husstanden. Fødselsår settes under{" "}
          <Link href="/husstand" className="inline-knapp" style={{ minHeight: 0 }}>
            Husstand
          </Link>
          . Gjester og fravær velger du i ukesplanen.
        </p>
      </section>

      <form action={lagreInnstillinger}>
        <fieldset className="gruppe">
          <legend className="kt">Dager med forslag</legend>
          <div className="chips">
            {UKEDAGER.map((d, i) => (
              <label key={d} className="chip-avkryss">
                <input type="checkbox" name="dag" value={i + 1} defaultChecked={inn.dager.includes(i + 1)} />
                <span>{d}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="to-felt">
          <label>
            <span className="kt">Tid på hverdager</span>
            <select name="hverdag_minutter" defaultValue={inn.hverdag_minutter} className="felt">
              {[20, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  Inntil {m} min
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="kt">Postnummer</span>
            <input name="postnummer" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} defaultValue={inn.postnummer ?? ""} placeholder="0000" className="felt" />
          </label>
        </div>
        <p className="dempet liten" style={{ marginTop: -6 }}>
          {inn.postnummer && !inn.lat
            ? "Fant ikke postnummeret. Sjekk at det stemmer."
            : `Brukes til å finne tilbud i butikker i nærheten${inn.sted ? ` (${inn.sted})` : ""}.`}
        </p>

        <label>
          <span className="kt">Handle i inntil</span>
          <select name="maks_butikker" defaultValue={inn.maks_butikker} className="felt">
            <option value={1}>1 butikk</option>
            <option value={2}>2 butikker</option>
            <option value={3}>3 butikker</option>
          </select>
        </label>
        <p className="dempet liten" style={{ marginTop: -6 }}>
          «Billigst» på handlelisten for uka fordeler handelen på inntil så mange butikker. Du ser hva hver butikk alene koster, og kan bytte.
        </p>

        <label htmlFor="onsker" className="kt">
          Ønsker og instruksjoner <span className="valgfritt">(valgfritt)</span>
        </label>
        <textarea id="onsker" name="onsker" rows={3} maxLength={1000} defaultValue={inn.onsker} placeholder="F.eks. fisk minst én gang i uka, vegetar på mandager, retter med merkelappen batch cooking på søndager så vi får rester" className="felt" />

        <label htmlFor="basisvarer" className="kt">
          Har alltid hjemme
        </label>
        <textarea
          id="basisvarer"
          name="basisvarer"
          rows={3}
          maxLength={3000}
          defaultValue={inn.basisvarer.join(", ")}
          placeholder="salt, pepper, olje"
          className="felt"
        />
        <p className="dempet liten" style={{ marginTop: -6 }}>
          Skill med komma. Dette kommer ikke på handlelisten når menyen lages.
        </p>

        <label className="avkryss">
          <input type="checkbox" name="aktiv" value="1" defaultChecked={inn.aktiv} />
          <span>
            <b>Ny meny automatisk</b>
            <small className="dempet liten">Hver søndag kveld, for uka som kommer</small>
          </span>
        </label>

        <button type="submit" className="primar" style={{ marginTop: 12 }}>
          Lagre
        </button>
      </form>

      <section className="kort" id="butikker" style={{ marginTop: 22 }}>
        <p className="kt">Butikker, i prioritert rekkefølge</p>
        <ButikkRekkefolge key={inn.butikker.join()} butikker={inn.butikker} />
        {ledige.length > 0 && (
          <form action={endreButikker} className="tid-rad">
            <input type="hidden" name="hva" value="legg-til" />
            <label htmlFor="ny-butikk" className="visuelt-skjult">
              Legg til butikk
            </label>
            <select id="ny-butikk" name="kode" className="felt">
              {ledige.map((b) => (
                <option key={b.kode} value={b.kode}>
                  {b.navn}
                </option>
              ))}
            </select>
            <button type="submit" className="inline-knapp">
              Legg til
            </button>
          </form>
        )}
        <p className="dempet liten">Hold i ⠿ og dra for å endre rekkefølgen. Tilbud i butikkene øverst foretrekkes, og de velges først når handelen fordeles.</p>
      </section>

      <section className="kort" id="allergier">
        <p className="kt">Allergier og intoleranser</p>
        {allergier.length === 0 ? (
          <p className="dempet">Ingen lagt inn.</p>
        ) : (
          <ul className="allergiliste">
            {allergier.map((a) => (
              <li key={a.id}>
                <span>
                  <b>{a.navn}</b> · {navnPa(a.person_id)}
                  <small className="dempet liten" style={{ display: "block" }}>
                    {GRADER.find((g) => g.verdi === a.grad)?.navn} · {HANDTERINGER.find((h) => h.verdi === a.handtering)?.navn}
                    {a.erstatning && ` · ${a.erstatning}`}
                  </small>
                </span>
                <form action={fjernAllergi}>
                  <input type="hidden" name="allergi" value={a.id} />
                  <button type="submit" className="liten-pil" aria-label={`Fjern ${a.navn}`}>
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <details className="ny-allergi" open={allergier.length === 0}>
          <summary className="inline-knapp">Legg til allergi eller intoleranse</summary>
          <form action={leggTilAllergi}>
            <div className="to-felt">
              <label>
                <span className="dempet liten">Hva</span>
                <input name="navn" required maxLength={60} placeholder="F.eks. gluten" className="felt" />
              </label>
              <label>
                <span className="dempet liten">Hvem</span>
                <select name="person" className="felt">
                  <option value="">Alle</option>
                  {personer.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.navn}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="gruppe">
              <legend className="dempet liten">Hvor strengt</legend>
              {GRADER.map((g, i) => (
                <label key={g.verdi} className="radio">
                  <input type="radio" name="grad" value={g.verdi} defaultChecked={i === 0} />
                  <span>
                    {g.navn} <small className="dempet">– {g.forklaring}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="gruppe">
              <legend className="dempet liten">Hva skal vi gjøre</legend>
              {HANDTERINGER.map((h, i) => (
                <label key={h.verdi} className="radio">
                  <input type="radio" name="handtering" value={h.verdi} defaultChecked={i === 0} />
                  <span>
                    {h.navn} <small className="dempet">– {h.forklaring}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              <span className="dempet liten">
                Erstatning <span className="valgfritt">(valgfritt)</span>
              </span>
              <input name="erstatning" maxLength={300} placeholder="F.eks. glutenfri pasta og brød – litt i saus går fint" className="felt" />
            </label>
            {feil === "allergi" && <p className="feil">Fyll inn hva det gjelder.</p>}
            <button type="submit" className="sekundar">
              Legg til
            </button>
          </form>
        </details>
        <p className="dempet liten">Dette er hjelp til planleggingen. Ved alvorlig allergi må dere fortsatt sjekke varene selv.</p>
      </section>
    </Side>
  );
}
