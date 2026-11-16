import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../../husstand/personer";
import { hentHusstand } from "../../planter/data";
import { Side } from "../../side";
import { nyTur } from "../actions";
import { TurSkjema } from "../tur-skjema";

export default async function NyTur({ searchParams }: { searchParams: Promise<{ feil?: string }> }) {
  const { feil } = await searchParams;
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  const personer = husstand ? await hentPersoner(supabase, husstand.id) : [];
  return (
    <Side tittel="Ny tur" tilbake={{ href: "/pakkeliste", navn: "Pakkeliste" }}>
      {feil && <p className="feil">{feil === "dato" ? "Velg når turen starter." : "Det gikk ikke å lagre. Prøv igjen."}</p>}
      <TurSkjema personer={personer} handling={nyTur} knapp="Lag pakkeliste" />
      <p className="dempet liten" style={{ textAlign: "center" }}>
        Det som alltid skal med, kommer på listen med en gang. Agenten foreslår resten om noen minutter.
      </p>
    </Side>
  );
}
