import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../../husstand/personer";
import { hentHusstand } from "../../planter/data";
import { Side } from "../../side";
import { lagreInnstillinger } from "../actions";
import { hentAlltid, hentInstruksjoner, tingTekst } from "../data";
import { alltidForslag, FELLES_FORSLAG, INSTRUKSJONER_FORSLAG } from "../forslag";

export default async function Innstillinger({ searchParams }: { searchParams: Promise<{ lagret?: string; feil?: string }> }) {
  const { lagret, feil } = await searchParams;
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  const tilbake = { href: "/pakkeliste", navn: "Pakkeliste" };
  if (!husstand) return <Side tittel="Innstillinger" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;
  const [personer, alltid, instruksjoner, { count: lagretFor }] = await Promise.all([
    hentPersoner(supabase, husstand.id),
    hentAlltid(supabase, husstand.id),
    hentInstruksjoner(supabase, husstand.id),
    supabase.schema("pakkeliste").from("innstillinger").select("household_id", { count: "exact", head: true }).eq("household_id", husstand.id),
  ]);
  // Før noe er lagret, står det et forslag i feltene, tilpasset alderen.
  const forslag = !lagretFor && alltid.length === 0;
  const iar = new Date().getFullYear();
  const felt = (person: string | null) => tingTekst(alltid.filter((a) => a.person_id === person));
  // Høyt nok til å vise alt, med én tom linje til å skrive på.
  const rader = (tekst: string) => Math.max(4, tekst.split("\n").length + 1);
  const verdi = (person: string | null, fodselsar: number | null) =>
    forslag ? (person ? alltidForslag(fodselsar, iar) : FELLES_FORSLAG).join("\n") : felt(person);

  return (
    <Side tittel="Innstillinger" tilbake={tilbake}>
      {lagret && <p className="dempet">Lagret.</p>}
      {feil && <p className="feil">Det gikk ikke å lagre. Prøv igjen.</p>}
      {forslag && (
        <div className="kort stiplet">
          <p className="kt">Forslag</p>
          <p>Feltene er fylt ut med et forslag ut fra alderen. Tilpass dem og trykk «Lagre».</p>
        </div>
      )}
      <form action={lagreInnstillinger}>
        <p className="kt" style={{ marginBottom: 0 }}>
          Alltid med
        </p>
        <p className="dempet liten" style={{ marginTop: 2 }}>
          Kommer på listen med en gang en tur lages. Én per linje, med antall foran: «2 ullsokker».
        </p>
        {personer.map((p) => (
          <label key={p.id} className="pk-alltid">
            <span className="pk-hode">
              <i style={{ background: p.farge }} aria-hidden="true" />
              {p.navn}
              {p.fodselsar && iar - p.fodselsar < 18 ? ` (${iar - p.fodselsar})` : ""}
            </span>
            <textarea name={`alltid_${p.id}`} rows={rader(verdi(p.id, p.fodselsar))} maxLength={3000} defaultValue={verdi(p.id, p.fodselsar)} className="felt" />
          </label>
        ))}
        <label className="pk-alltid">
          <span className="pk-hode">Felles</span>
          <textarea name="alltid_felles" rows={rader(verdi(null, null))} maxLength={3000} defaultValue={verdi(null, null)} className="felt" />
        </label>

        <label htmlFor="instruksjoner" className="kt">
          Instruksjoner til agenten
        </label>
        <p className="dempet liten" style={{ marginTop: 2 }}>
          Hvordan dere reiser og hva den bør tenke på når den foreslår pakkelister.
        </p>
        <textarea
          id="instruksjoner"
          name="instruksjoner"
          rows={6}
          maxLength={2000}
          defaultValue={forslag ? INSTRUKSJONER_FORSLAG : instruksjoner}
          placeholder="F.eks. Vi kjører alltid bil. Vi har sengetøy på hytta. Mia fryser lett."
          className="felt"
        />
        <button type="submit" className="primar" style={{ marginTop: 12 }}>
          Lagre
        </button>
      </form>
    </Side>
  );
}
