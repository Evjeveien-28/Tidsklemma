import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { Side } from "../../../side";
import { endrePerson, slettPerson } from "../../actions";
import { FARGER, hentPersoner } from "../../personer";
import { SlettPersonKnapp } from "./slett-knapp";

export default async function EndrePerson({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feil?: string }>;
}) {
  const [{ id }, { feil }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: person }, { data: meg }] = await Promise.all([
    supabase.from("household_people").select("id, household_id, user_id, navn, farge, fodselsar").eq("id", id).maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  if (!person) notFound();
  const andre = (await hentPersoner(supabase, person.household_id)).filter((p) => p.id !== person.id);
  const erMeg = person.user_id !== null && person.user_id === meg?.claims.sub;
  const kanEndreNavn = person.user_id === null || erMeg;

  return (
    <Side tittel={person.navn} tilbake={{ href: "/husstand", navn: "Husstanden" }}>
      <form action={endrePerson}>
        <input type="hidden" name="person" value={person.id} />
        {kanEndreNavn ? (
          <>
            <label htmlFor="navn" className="kt">
              Navn
            </label>
            <input id="navn" name="navn" required maxLength={40} defaultValue={person.navn} autoComplete="off" className="felt" />
          </>
        ) : (
          <p className="dempet">{person.navn} har app og setter navnet sitt selv under Meg.</p>
        )}

        <label htmlFor="fodselsar" className="kt">
          Fødselsår <span className="valgfritt">(valgfritt)</span>
        </label>
        <input
          id="fodselsar"
          name="fodselsar"
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear()}
          defaultValue={person.fodselsar ?? ""}
          placeholder="F.eks. 2017"
          className="felt"
        />
        <p className="dempet liten" style={{ marginTop: -6 }}>
          Brukes til å regne porsjoner i middagsplanen, og til å skille barn og voksne.
        </p>

        <fieldset className="fargevalg">
          <legend className="kt">Farge</legend>
          <div className="farger">
            {FARGER.map((f) => {
              const brukt = andre.find((p) => p.farge === f.hex);
              return (
                <label key={f.hex} className="farge" title={brukt ? `${f.navn}, brukt av ${brukt.navn}` : f.navn}>
                  <input type="radio" name="farge" value={f.hex} defaultChecked={person.farge === f.hex} disabled={!!brukt} />
                  <span className="fargeprikk stor" style={{ background: f.hex }} aria-hidden="true" />
                  <span className="farge-navn">{brukt ? brukt.navn : f.navn}</span>
                </label>
              );
            })}
          </div>
          <p className="dempet liten">Fargen viser hvem som skal være med i familiekalenderen. Brukte farger er grået ut.</p>
        </fieldset>

        {feil && <p className="feil">Det gikk ikke å lagre. Sjekk navnet og prøv igjen.</p>}
        <button type="submit" className="primar" style={{ marginTop: 8 }}>
          Lagre
        </button>
      </form>

      {person.user_id === null && (
        <form action={slettPerson} className="bunnknapper">
          <input type="hidden" name="person" value={person.id} />
          <SlettPersonKnapp navn={person.navn} />
        </form>
      )}
    </Side>
  );
}
