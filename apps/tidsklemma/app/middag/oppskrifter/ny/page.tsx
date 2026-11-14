import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { hentHusstand } from "../../../planter/data";
import { alleMerkelapper, hentOppskrifter } from "../../data";
import { Side } from "../../../side";
import { leggTilFraLenke } from "../../actions";
import { OppskriftSkjema } from "../../oppskrift-skjema";
import { HentKnapp } from "./hent-knapp";

const feiltekst: Record<string, string> = {
  lenke: "Det ser ikke ut som en lenke. Kopier adressen fra oppskriftssiden og lim den inn.",
  lagre: "Det gikk ikke å lagre. Prøv igjen.",
  navn: "Oppskriften må ha et navn.",
};

export default async function NyOppskrift({ searchParams }: { searchParams: Promise<{ manuell?: string; feil?: string; lenke?: string }> }) {
  const { manuell, feil, lenke } = await searchParams;
  const tilbake = { href: "/middag/oppskrifter", navn: "Oppskrifter" };
  if (manuell) {
    const supabase = await createClient();
    const husstand = await hentHusstand(supabase);
    const brukte = husstand ? alleMerkelapper(await hentOppskrifter(supabase, husstand.id).catch(() => [])) : [];
    return (
      <Side tittel="Ny oppskrift" tilbake={tilbake}>
        {feil && <p className="feil">{feiltekst[feil]}</p>}
        <OppskriftSkjema brukte={brukte} />
      </Side>
    );
  }
  return (
    <Side tittel="Ny oppskrift" tilbake={tilbake}>
      {feil && <p className="feil">{feiltekst[feil]}</p>}
      <form action={leggTilFraLenke}>
        <label htmlFor="lenke" className="kt">
          Lenke til oppskriften
        </label>
        <input id="lenke" name="lenke" type="url" inputMode="url" required defaultValue={lenke} placeholder="https://www.matprat.no/oppskrifter/…" className="felt" autoFocus />
        <p className="dempet liten" style={{ marginTop: -4 }}>
          Navn, ingredienser, tid og porsjoner hentes fra siden. Går ikke det, lagres lenken og fylles ut automatisk senere.
        </p>
        <HentKnapp />
      </form>
      <div className="bunnmeny">
        <Link href="/middag/oppskrifter/ny?manuell=1">Skriv inn selv i stedet</Link>
      </div>
    </Side>
  );
}
