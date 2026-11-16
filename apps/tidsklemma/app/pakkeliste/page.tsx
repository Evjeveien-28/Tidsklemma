import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../database-feil";
import { iDag } from "../dato";
import { hentPersoner } from "../husstand/personer";
import { hentHusstand } from "../planter/data";
import { Side } from "../side";
import { hentFremdrift, hentTurer, periode, type Tur } from "./data";

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
  const farger = ["brun", "gronn", "blaa"];
  const nar = (t: Tur) => {
    if (t.fra <= idag) return "nå";
    const dager = Math.round((Date.parse(`${t.fra}T12:00:00Z`) - Date.parse(`${idag}T12:00:00Z`)) / 86_400_000);
    return dager === 1 ? "i morgen" : `om ${dager} dager`;
  };

  // Én flis per tur, som listene i Handleliste. Kommende i farger, tidligere i krem.
  const flis = (t: Tur, farge: string, kommer: boolean) => {
    const f = fremdrift.get(t.id);
    const med = personer.filter((p) => t.personer.includes(p.id));
    return (
      <Link key={t.id} href={`/pakkeliste/${t.id}`} className={`flis flis-${farge} pk-flis`}>
        <b>{t.tittel}</b>
        <small>
          {periode(t.fra, t.til)}
          {kommer && ` · ${nar(t)}`}
        </small>
        <small>
          {t.laast_at ? "Låst" : f && f.alle > 0 ? `${f.pakket}/${f.alle} pakket` : "Tom liste"}
        </small>
        <span className="pk-prikker" aria-label={med.map((p) => p.navn).join(", ")}>
          {med.map((p) => (
            <i key={p.id} style={{ background: p.farge }} title={p.navn} />
          ))}
        </span>
      </Link>
    );
  };

  return (
    <Side tittel="Pakkeliste" tilbake={tilbake}>
      {kommende.length === 0 && <p className="dempet" style={{ marginTop: 0 }}>Legg inn en tur, så får hver av dere en pakkeliste. Dere ser hva de andre har pakket.</p>}
      <div className="rutenett">
        {kommende.map((t, i) => flis(t, farger[i % farger.length]!, true))}
        <Link href="/pakkeliste/ny" className="flis flis-krem hl-flis-ny">
          <b>+ Ny tur</b>
          <small>Lag en pakkeliste</small>
        </Link>
      </div>
      {tidligere.length > 0 && (
        <>
          <p className="kt" style={{ marginTop: 24 }}>
            Tidligere turer
          </p>
          <div className="rutenett">{tidligere.map((t) => flis(t, "krem", false))}</div>
        </>
      )}

      <nav className="meg-meny" aria-label="Pakkeliste" style={{ marginTop: 24 }}>
        <Link href="/pakkeliste/innstillinger" className="meg-lenke">
          <span>
            Innstillinger
            <small className="dempet liten" style={{ display: "block" }}>
              Det som alltid skal med, og instruksjoner til agenten
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      </nav>
    </Side>
  );
}
