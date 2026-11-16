import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../database-feil";
import { hentHusstand } from "../planter/data";
import { Side } from "../side";
import { anslag, hentIgjen, hentLister, kr, listeSti, type EgenListe } from "./data";
import { NyListeKnapp } from "./ny-liste-knapp";

const tilbake = { href: "/", navn: "Tilbake" };

/** Handlelistene som fliser: Mat først (alltid der, den Middag sender til), så husstandens egne, og «Ny handleliste». */
export default async function Handlelister() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) return <Side tittel="Handleliste" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;

  let lister: EgenListe[];
  let igjen: Awaited<ReturnType<typeof hentIgjen>>;
  try {
    [lister, igjen] = await Promise.all([hentLister(supabase, husstand.id), hentIgjen(supabase, husstand.id)]);
  } catch (e) {
    return (
      <Side tittel="Handleliste" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="handlelistene" schema="handleliste" tabeller="handleliste.varer, handleliste.lister" />
      </Side>
    );
  }

  const status = (id: string | null) => {
    const varer = igjen.filter((v) => (v.liste_id ?? null) === id);
    if (varer.length === 0) return "Tom";
    const sum = id ? 0 : varer.reduce((a, v) => a + (anslag(v) ?? 0), 0);
    return `${varer.length} ${varer.length === 1 ? "vare" : "varer"}${sum > 0 ? ` · ca. ${kr(sum, true)} kr` : ""}`;
  };
  const fliser = [{ id: null, navn: "Mat" }, ...lister];
  const farger = ["brun", "gronn", "blaa"];

  return (
    <Side tittel="Handleliste" tilbake={tilbake}>
      <div className="rutenett">
        {fliser.map((l, i) => (
          <Link key={l.id ?? "mat"} href={listeSti(l.id)} className={`flis flis-${farger[i % farger.length]}`}>
            <b>{l.navn}</b>
            <small>{status(l.id)}</small>
          </Link>
        ))}
        <NyListeKnapp />
      </div>
    </Side>
  );
}
