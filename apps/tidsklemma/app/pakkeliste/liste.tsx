"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fjernTing, settPakket } from "./actions";

export type PakkRad = { id: string; navn: string; antall: number; pakket: boolean; agent: boolean };
export type Gruppe = { id: string; navn: string; farge: string | null; rader: PakkRad[] };

type Endring = { id: string; pakket?: boolean; fjernet?: boolean };

/**
 * Pakkelisten, en gruppe per person og én felles. Trykk på en ting for å krysse den av som pakket.
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
                {rader.map((r) => {
                  const pa = tilstand.get(r.id)?.pakket ?? r.pakket;
                  return (
                    <li key={r.id} className={pa ? "hl-rad pk-rad pa" : "hl-rad pk-rad"}>
                      <button
                        type="button"
                        className="hl-trykk"
                        role="checkbox"
                        aria-checked={pa}
                        onClick={() =>
                          start(async () => {
                            endre({ id: r.id, pakket: !pa });
                            await settPakket(r.id, !pa);
                          })
                        }
                      >
                        <span className="hl-kryss" aria-hidden>
                          {pa ? "✓" : ""}
                        </span>
                        <span className="hl-tekst">
                          <b>
                            {r.antall > 1 && `${r.antall} × `}
                            {r.navn}
                          </b>
                        </span>
                      </button>
                      <Link href={`/pakkeliste/${tur}/ting/${r.id}`} className="pk-endre" aria-label={`Endre ${r.navn}`}>
                        ✎
                      </Link>
                      {!laast && (
                        <button
                          type="button"
                          className="pk-fjern"
                          aria-label={`Fjern ${r.navn}`}
                          onClick={() =>
                            start(async () => {
                              endre({ id: r.id, fjernet: true });
                              await fjernTing(r.id);
                            })
                          }
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
