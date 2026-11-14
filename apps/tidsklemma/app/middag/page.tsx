import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../database-feil";
import { hentHusstand } from "../planter/data";
import { Side } from "../side";
import { butikkNavn } from "./butikker";
import { hentInnstillinger, hentOppskrifter, UKEDAGER } from "./data";

const tilbake = { href: "/", navn: "Tilbake" };

export default async function Middag() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) {
    return (
      <Side tittel="Middag" tilbake={tilbake}>
        <p>Du er ikke medlem av en husstand ennå.</p>
      </Side>
    );
  }
  let oppskrifter, inn;
  try {
    [oppskrifter, inn] = await Promise.all([hentOppskrifter(supabase, husstand.id), hentInnstillinger(supabase, husstand.id)]);
  } catch (e) {
    return (
      <Side tittel="Middag" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="middag" schema="middag" tabeller="middag-tabellene" />
      </Side>
    );
  }
  const favoritter = oppskrifter.filter((o) => o.favoritt).length;

  return (
    <Side tittel="Middag" tilbake={tilbake}>
      <div className="kort stiplet">
        <p className="kt">Ukesmeny</p>
        <p>Kommer snart: forslag til middager fra kokeboka deres, ut fra ukens tilbud, med handleliste.</p>
        <p className="dempet liten">Menyen velger bare blant oppskriftene dere har lagt inn, så legg gjerne inn favorittene i mellomtiden.</p>
      </div>

      <nav className="meg-meny" aria-label="Middag">
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
