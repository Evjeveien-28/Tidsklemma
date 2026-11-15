import { createClient } from "@hjem/db/server";
import { iDag, leggTilDager } from "../../dato";
import { hentPersoner } from "../../husstand/personer";
import { hentHusstand } from "../../planter/data";
import { Side } from "../../side";
import { bestill } from "../actions";
import { hentInnstillinger, hentOppskrifter } from "../data";
import { BestillKnapp } from "./bestill-knapp";
import { dagTekst, mandagI, middagsdager, standardUke, ukeTekst } from "../uke";

export default async function Planlegg({ searchParams }: { searchParams: Promise<{ uke?: string; feil?: string }> }) {
  const { uke: u, feil } = await searchParams;
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  const tilbake = { href: `/middag${u ? `?uke=${u}` : ""}`, navn: "Middag" };
  if (!husstand) return <Side tittel="Planlegg uka" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;
  const denne = mandagI(iDag());
  const uke = u === denne || u === leggTilDager(denne, 7) ? u : standardUke();
  const [inn, oppskrifter, personer] = await Promise.all([
    hentInnstillinger(supabase, husstand.id),
    hentOppskrifter(supabase, husstand.id),
    hentPersoner(supabase, husstand.id),
  ]);
  const dager = middagsdager(uke, inn.dager);

  return (
    <Side tittel="Planlegg uka" tilbake={tilbake}>
      <p className="dempet" style={{ marginTop: 0 }}>
        {ukeTekst(uke).replace(/\.$/, "")}. Velg egne retter der dere vil, og hvem som spiser. Resten foreslås fra kokeboka ut fra tilbudene.
      </p>
      {oppskrifter.length < dager.length * 2 && (
        <div className="kort stiplet">
          <p>
            Kokeboka har {oppskrifter.length} {oppskrifter.length === 1 ? "oppskrift" : "oppskrifter"}. Med så få blir det få alternativer å velge mellom, og
            noen retter kan komme flere ganger.
          </p>
        </div>
      )}
      {feil && <p className="feil">{feil === "dager" ? "Det er ingen dager igjen denne uka. Velg neste uke." : "Det gikk ikke å bestille. Prøv igjen."}</p>}

      {dager.length === 0 ? (
        <p>Det er ingen middagsdager igjen denne uka.</p>
      ) : (
        <form action={bestill}>
          <input type="hidden" name="uke" value={uke} />
          {dager.map((dato) => (
            <fieldset key={dato} className="kort pdag">
              <legend className="kt">{dagTekst(dato)}</legend>
              <input type="hidden" name="dato" value={dato} />
              <select name={`oppskrift_${dato}`} defaultValue="" className="felt" aria-label={`Rett ${dagTekst(dato)}`}>
                <option value="">Foreslå fra tilbudene</option>
                <option value="fri">Ingen middag (rester, ute e.l.)</option>
                {oppskrifter.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.favoritt ? "★ " : ""}
                    {o.navn}
                  </option>
                ))}
              </select>
              <div className="chips">
                {personer.map((p) => (
                  <label key={p.id} className="chip-avkryss">
                    <input type="checkbox" name={`med_${dato}`} value={p.id} defaultChecked />
                    <span>{p.navn}</span>
                  </label>
                ))}
                <label className="gjester">
                  <span>+ gjester</span>
                  <input name={`gjester_${dato}`} type="number" inputMode="numeric" min={0} max={30} defaultValue={0} className="felt" />
                </label>
              </div>
            </fieldset>
          ))}
          <BestillKnapp />
          <p className="dempet liten" style={{ textAlign: "center" }}>
            Menyen er klar om noen minutter, med tre forslag per dag. Lager dere ny meny for samme uke, erstatter den den gamle.
          </p>
        </form>
      )}
    </Side>
  );
}
