"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SveipRad } from "../sveip-rad";
import { fjernVare, settAvkrysset } from "./actions";

export type Rad = {
  id: string;
  tittel: string;
  under: string | null;
  tilbud: string | null;
  pris: string | null;
  /** Merke ved prisen: % for tilbud, ≈ for anslått med Odas pris (varer fra Middag). */
  merke: "tilbud" | "anslag" | null;
  /** «−12 kr mot Kiwi»: hva varen sparer (bra) eller koster ekstra mot de andre butikkene i fordelingen. */
  forskjell: { tekst: string; bra: boolean } | null;
  avkrysset: boolean;
};

type Endring = { id: string; pa?: boolean; fjernet?: boolean };

/**
 * Varene. Trykk hvor som helst på raden for å krysse av. Dra raden til venstre for å få fram Rediger og Fjern.
 * Avkrysning og fjerning skjer med en gang. Henter listen på nytt når appen kommer i forgrunnen igjen.
 */
export function Liste({ grupper }: { grupper: { navn: string | null; rader: Rad[] }[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [tilstand, endre] = useOptimistic(
    new Map<string, { pa: boolean; fjernet: boolean }>(grupper.flatMap((g) => g.rader.map((r) => [r.id, { pa: r.avkrysset, fjernet: false }]))),
    (forrige, e: Endring) => {
      const ny = new Map(forrige);
      const naa = ny.get(e.id) ?? { pa: false, fjernet: false };
      ny.set(e.id, { pa: e.pa ?? naa.pa, fjernet: e.fjernet ?? naa.fjernet });
      return ny;
    },
  );
  // Bare én rad kan stå åpen om gangen.
  const [apen, setApen] = useState<string | null>(null);

  useEffect(() => {
    const synlig = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", synlig);
    return () => document.removeEventListener("visibilitychange", synlig);
  }, [router]);

  return (
    <>
      {grupper.map((g) => {
        const rader = g.rader.filter((r) => !tilstand.get(r.id)?.fjernet);
        if (rader.length === 0) return null;
        return (
          <section key={g.navn ?? "ingen"}>
            {g.navn && <p className="kt hl-gruppe">{g.navn}</p>}
            <ul className="hl-liste">
              {rader.map((r) => (
                <SveipRad
                  key={r.id}
                  navn={r.tittel}
                  pa={tilstand.get(r.id)?.pa ?? r.avkrysset}
                  apen={apen === r.id}
                  settApen={(ja) => setApen(ja ? r.id : null)}
                  redigerHref={`/handleliste/${r.id}`}
                  kryss={(pa) =>
                    start(async () => {
                      endre({ id: r.id, pa });
                      await settAvkrysset(r.id, pa);
                    })
                  }
                  fjern={() =>
                    start(async () => {
                      setApen(null);
                      endre({ id: r.id, fjernet: true });
                      await fjernVare(r.id);
                    })
                  }
                >
                  <Innhold r={r} />
                </SveipRad>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/** Navn, pris og tilbud på en vare. */
function Innhold({ r }: { r: Rad }) {
  return (
    <>
      <span className="hl-tekst">
        <b>{r.tittel}</b>
        {r.under && <small>{r.under}</small>}
        {r.tilbud && <small className="hl-tilbud">{r.tilbud}</small>}
        {r.forskjell && <small className={r.forskjell.bra ? "hl-spart" : undefined}>{r.forskjell.tekst}</small>}
      </span>
      {r.pris && (
        <span className="hl-pris">
          {r.pris}
          {r.merke && (
            <span className={`pmerke ${r.merke}`} title={r.merke === "tilbud" ? "Tilbud" : "Anslått med Odas pris"}>
              {r.merke === "tilbud" ? "%" : "≈"}
            </span>
          )}
        </span>
      )}
    </>
  );
}
