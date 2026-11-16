import Link from "next/link";
import { createClient } from "@hjem/db/server";
import { kalenderStatus } from "./familiekalender/status";
import { anslag, hentVarer as hentHandleliste, kr } from "./handleliste/data";
import { middagStatus } from "./middag/status";
import { pakkelisteStatus } from "./pakkeliste/data";
import { iDag } from "./dato";
import { hentPlanter } from "./planter/data";
import { deler } from "../deler";
import { Ikon } from "./ikoner";
import { lagreFornavn } from "./meg/actions";
import { hentBruker } from "./meg/bruker";
import { PasskeyForslag } from "./passkey-forslag";
import { Side } from "./side";
import { hentPersoner, type Person } from "./husstand/personer";
import "./forside.css";

/** Hvem flisen gjelder: én prikk per person, i personens farge. */
function Prikker({ ider, personer }: { ider?: string[]; personer: Person[] }) {
  const med = personer.filter((p) => ider?.includes(p.id));
  if (med.length === 0) return null;
  return (
    <span className="flis-prikker" aria-label={`Gjelder ${med.map((p) => p.navn).join(", ")}`}>
      {med.map((p) => (
        <i key={p.id} style={{ background: p.farge }} title={p.navn} />
      ))}
    </span>
  );
}

const farger = ["brun", "blaa", "gronn", "krem"] as const;

function hilsen() {
  const time = Number(new Intl.DateTimeFormat("nb-NO", { hour: "numeric", timeZone: "Europe/Oslo" }).format(new Date()));
  if (time < 5) return "God natt";
  if (time < 10) return "God morgen";
  if (time < 18) return "God dag";
  return "God kveld";
}

export default async function Hjem() {
  const supabase = await createClient();
  const [{ data: husstander }, bruker] = await Promise.all([supabase.from("households").select("id, name"), hentBruker()]);
  const husstand = husstander?.[0];

  // Levende tekst og rød prikk på flisene som har noe å melde.
  // `personer`: hvem det gjelder, vist som prikker i personenes farger.
  const status: Record<string, { tekst: string; antall: number; personer?: string[] }> = {};
  if (husstand) {
    const handleliste = await hentHandleliste(supabase, husstand.id).catch(() => null);
    if (handleliste) {
      const igjen = handleliste.filter((v) => !v.avkrysset_at);
      const sum = igjen.reduce((a, v) => a + (anslag(v) ?? 0), 0);
      status.handleliste = {
        antall: 0,
        tekst: igjen.length === 0 ? "Tom" : `${igjen.length} ${igjen.length === 1 ? "vare" : "varer"}${sum > 0 ? ` · ca. ${kr(sum, true)} kr` : ""}`,
      };
    }
    const middag = await middagStatus(supabase, husstand.id).catch(() => null);
    if (middag) status.middag = middag;
    const pakkeliste = await pakkelisteStatus(supabase, husstand.id, iDag()).catch(() => null);
    if (pakkeliste) status.pakkeliste = pakkeliste;
    const [planter, kalender] = await Promise.all([
      hentPlanter(supabase, husstand.id).catch(() => null),
      kalenderStatus(supabase, husstand.id).catch(() => null),
    ]);
    if (kalender) status.familiekalender = kalender;
    if (planter) {
      const antall = planter.filter((p) => p.trengerVann).length;
      status.planter = {
        antall,
        tekst: planter.length === 0 ? "Legg til planter" : antall > 0 ? `${antall} trenger vann` : "Alt er vannet",
      };
    }
  }

  const personer = husstand ? await hentPersoner(supabase, husstand.id).catch(() => []) : [];

  return (
    <Side>
      <p className="hilsen">
        {hilsen()}
        {bruker?.fornavn ? `, ${bruker.fornavn}` : husstand && <span className="dempet"> · {husstand.name}</span>}
      </p>
      {!husstand && <p>Du er ikke medlem av en husstand ennå.</p>}

      {bruker && !bruker.fornavn && (
        <form action={lagreFornavn} className="kort">
          <input type="hidden" name="tilbake" value="/" />
          <label htmlFor="fornavn" className="kt">
            Hva heter du?
          </label>
          <p className="dempet liten" style={{ marginTop: 0 }}>
            Fornavnet vises for de andre i husstanden.
          </p>
          <div className="knapperad">
            <input id="fornavn" name="fornavn" required maxLength={40} autoComplete="given-name" className="felt" style={{ margin: 0, flex: 1 }} />
            <button type="submit" className="sekundar">
              Lagre
            </button>
          </div>
        </form>
      )}

      <PasskeyForslag />

      {deler.length === 0 ? (
        <div className="kort stiplet">
          <p className="kt">Ingen deler ennå</p>
          <p>Her kommer middag, handleliste og det andre vi lager.</p>
        </div>
      ) : (
        <div className="rutenett">
          {deler.map((del, i) => (
            <Link key={del.slug} href={`/${del.slug}`} className={`flis flis-${del.farge ?? farger[i % farger.length]}`}>
              <span className="ikon">
                <Ikon navn={del.ikon} storrelse={30} />
              </span>
              {status[del.slug]?.antall ? (
                <span className="merke-rod" aria-label={`${status[del.slug]!.antall} nye`}>
                  {status[del.slug]!.antall}
                </span>
              ) : null}
              <b>{del.navn}</b>
              <small>{status[del.slug]?.tekst ?? del.beskrivelse}</small>
              <Prikker ider={status[del.slug]?.personer} personer={personer} />
            </Link>
          ))}
        </div>
      )}

    </Side>
  );
}
