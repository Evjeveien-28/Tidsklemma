import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../../database-feil";
import { hentHusstand } from "../../planter/data";
import { Side } from "../../side";
import { alleMerkelapper, hentOppskrifter, type Oppskrift } from "../data";
import { Bilde } from "../bilde";
import { Stjerne } from "../stjerne";

export default async function Oppskrifter({ searchParams }: { searchParams: Promise<{ merkelapp?: string }> }) {
  const { merkelapp } = await searchParams;
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  const tilbake = { href: "/middag", navn: "Middag" };
  const pluss = (
    <Link href="/middag/oppskrifter/ny" className="pluss" aria-label="Ny oppskrift">
      +
    </Link>
  );
  if (!husstand) return <Side tittel="Oppskrifter" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;
  let liste: Oppskrift[];
  try {
    liste = await hentOppskrifter(supabase, husstand.id);
  } catch (e) {
    return (
      <Side tittel="Oppskrifter" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="oppskriftene" schema="middag" tabeller="middag-tabellene" />
      </Side>
    );
  }

  const merkelapper = alleMerkelapper(liste);
  const valgt = merkelapp && merkelapper.includes(merkelapp) ? merkelapp : null;
  const vis = valgt ? liste.filter((o) => o.merkelapper.includes(valgt)) : liste;

  return (
    <Side tittel="Oppskrifter" tilbake={tilbake} handling={pluss}>
      {merkelapper.length > 0 && (
        <nav className="merkelapp-filter" aria-label="Filtrer på merkelapp">
          <Link href="/middag/oppskrifter" className="merkelapp" aria-current={valgt ? undefined : "page"}>
            Alle
          </Link>
          {merkelapper.map((m) => (
            <Link key={m} href={`/middag/oppskrifter?merkelapp=${encodeURIComponent(m)}`} className="merkelapp" aria-current={valgt === m ? "page" : undefined}>
              {m}
            </Link>
          ))}
        </nav>
      )}
      {liste.length === 0 ? (
        <div className="kort stiplet">
          <p className="kt">Ingen oppskrifter ennå</p>
          <p>Trykk «+» og lim inn en lenke til en oppskrift, eller skriv den inn selv.</p>
        </div>
      ) : (
        <ul className="oliste">
          {vis.map((o) => (
            <li key={o.id} className="orad">
              <Link href={`/middag/oppskrifter/${o.id}`} className="olenke">
                <span className="obilde">
                  <Bilde src={o.bilde_url} />
                </span>
                <span className="pt">
                  <b>{o.navn}</b>
                  <small>
                    {[o.minutter && `${o.minutter} min`, o.porsjoner && `${o.porsjoner} pers.`, ...o.merkelapper].filter(Boolean).join(" · ")}
                  </small>
                  {o.trenger_utfylling && <small className="ventende-merke">{o.lenke && !o.utfylling_forsokt ? "Fylles inn" : "Mangler ingredienser"}</small>}
                </span>
              </Link>
              <Stjerne id={o.id} pa={o.favoritt} tilbake="liste" />
            </li>
          ))}
        </ul>
      )}
    </Side>
  );
}
