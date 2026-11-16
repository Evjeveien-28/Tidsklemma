import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../database-feil";
import { iDag } from "../dato";
import { hentPersoner } from "../husstand/personer";
import { hentHusstand } from "../planter/data";
import { Side } from "../side";
import { hentFremdrift, hentTurer, netter, periode, type Tur } from "./data";

const tilbake = { href: "/", navn: "Tilbake" };

export default async function Pakkeliste() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) return <Side tittel="Pakkeliste" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;
  let turer: Tur[];
  try {
    turer = await hentTurer(supabase, husstand.id);
  } catch (e) {
    return (
      <Side tittel="Pakkeliste" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="pakkelistene" schema="pakkeliste" tabeller="pakkeliste.turer og pakkeliste.ting" />
      </Side>
    );
  }
  const [personer, fremdrift] = await Promise.all([hentPersoner(supabase, husstand.id), hentFremdrift(supabase, turer.map((t) => t.id))]);
  const idag = iDag();
  const kommende = turer.filter((t) => t.til >= idag);
  const tidligere = turer.filter((t) => t.til < idag).reverse().slice(0, 20);
  const ny = (
    <Link href="/pakkeliste/ny" className="pluss" aria-label="Ny tur">
      +
    </Link>
  );

  const kort = (t: Tur) => {
    const f = fremdrift.get(t.id);
    const med = personer.filter((p) => t.personer.includes(p.id));
    return (
      <li key={t.id}>
        <Link href={`/pakkeliste/${t.id}`} className="kort pk-tur">
          <span>
            <b>{t.tittel}</b>
            <small className="dempet">{[periode(t.fra, t.til), netter(t.fra, t.til), t.sted].filter(Boolean).join(" · ")}</small>
            <span className="pk-prikker" aria-label={med.map((p) => p.navn).join(", ")}>
              {med.map((p) => (
                <i key={p.id} style={{ background: p.farge }} title={p.navn} />
              ))}
            </span>
          </span>
          <span className="pk-status">
            {t.laast_at && <small className="dempet">Låst</small>}
            {f && f.alle > 0 && (
              <small>
                {f.pakket}/{f.alle} pakket
              </small>
            )}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <Side tittel="Pakkeliste" tilbake={tilbake} handling={ny}>
      {kommende.length === 0 && (
        <div className="kort stiplet">
          <p className="kt">Ingen turer planlagt</p>
          <p>Legg inn en tur, så får hver av dere en pakkeliste. Dere ser hva de andre har pakket.</p>
          <Link href="/pakkeliste/ny" className="inline-knapp">
            Ny tur ›
          </Link>
        </div>
      )}
      {kommende.length > 0 && <ul className="pk-turer">{kommende.map(kort)}</ul>}
      {tidligere.length > 0 && (
        <>
          <p className="kt" style={{ marginTop: 24 }}>
            Tidligere turer
          </p>
          <ul className="pk-turer">{tidligere.map(kort)}</ul>
        </>
      )}
    </Side>
  );
}
