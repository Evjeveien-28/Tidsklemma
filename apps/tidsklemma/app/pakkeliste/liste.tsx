"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SveipRad } from "../sveip-rad";
import { fjernTing, settPakket } from "./actions";

export type PakkRad = { id: string; navn: string; antall: number; pakket: boolean; agent: boolean };
export type Gruppe = { id: string; navn: string; farge: string | null; rader: PakkRad[] };

type Endring = { id: string; pakket?: boolean; fjernet?: boolean };

/**
 * Pakkelisten, en gruppe per person og én felles. Trykk på en ting for å krysse den av som pakket,
 * og dra den til venstre for å endre eller fjerne den (som i Handleliste).
 * Listen hentes på nytt jevnlig og når appen kommer i forgrunnen, så dere ser hva de andre har pakket.
 */
export function PakkListe({ tur, grupper, laast }: { tur: string; grupper: Gruppe[]; laast: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [tilstand, endre] = useOptimistic(
    new Map(grupper.flatMap((g) => g.rader.map((r) => [r.id, { pakket: r.pakket, fjernet: false }]))),
    (forrige, e: Endring) => {
      const ny = new Map(forrige);
      const naa = ny.get(e.id) ?? { pakket: false, fjernet: false };
      ny.set(e.id, { pakket: e.pakket ?? naa.pakket, fjernet: e.fjernet ?? naa.fjernet });
      return ny;
    },
  );

  // Bare én rad kan stå åpen om gangen.
  const [apen, setApen] = useState<string | null>(null);

  useEffect(() => {
    const oppdater = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", oppdater);
    const t = setInterval(oppdater, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", oppdater);
      clearInterval(t);
    };
  }, [router]);

  return (
    <>
      {grupper.map((g) => {
        const rader = g.rader.filter((r) => !tilstand.get(r.id)?.fjernet);
        const pakket = rader.filter((r) => tilstand.get(r.id)?.pakket).length;
        return (
          <section key={g.id} id={g.id} className="pk-gruppe">
            <p className="kt pk-hode">
              {g.farge && <i style={{ background: g.farge }} aria-hidden="true" />}
              {g.navn}
              {rader.length > 0 && (
                <span className="dempet">
                  {pakket}/{rader.length}
                </span>
              )}
            </p>
            {rader.length === 0 ? (
              <p className="dempet liten">Ingenting ennå.</p>
            ) : (
              <ul className="hl-liste">
                {rader.map((r) => (
                  <SveipRad
                    key={r.id}
                    navn={r.navn}
                    pa={tilstand.get(r.id)?.pakket ?? r.pakket}
                    apen={apen === r.id}
                    settApen={(ja) => setApen(ja ? r.id : null)}
                    redigerHref={`/pakkeliste/${tur}/ting/${r.id}`}
                    kryss={(pa) =>
                      start(async () => {
                        endre({ id: r.id, pakket: pa });
                        await settPakket(r.id, pa);
                      })
                    }
                    // En låst liste skal være slik den er: ting kan endres, men ikke fjernes.
                    fjern={
                      laast
                        ? undefined
                        : () =>
                            start(async () => {
                              setApen(null);
                              endre({ id: r.id, fjernet: true });
                              await fjernTing(r.id);
                            })
                    }
                  >
                    <span className="hl-tekst">
                      <b>
                        {r.antall > 1 && `${r.antall} × `}
                        {r.navn}
                      </b>
                    </span>
                  </SveipRad>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
