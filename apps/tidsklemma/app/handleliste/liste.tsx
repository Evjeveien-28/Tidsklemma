"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { settAvkrysset } from "./actions";

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

/** Varene, med avkrysning som skjer med en gang. Henter listen på nytt når appen kommer i forgrunnen igjen. */
export function Liste({ grupper }: { grupper: { navn: string | null; rader: Rad[] }[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [kryss, settKryss] = useOptimistic(
    new Map(grupper.flatMap((g) => g.rader.map((r) => [r.id, r.avkrysset] as const))),
    (forrige, { id, pa }: { id: string; pa: boolean }) => new Map(forrige).set(id, pa),
  );

  useEffect(() => {
    const synlig = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", synlig);
    return () => document.removeEventListener("visibilitychange", synlig);
  }, [router]);

  return (
    <>
      {grupper.map((g) => (
        <section key={g.navn ?? "ingen"}>
          {g.navn && <p className="kt hl-gruppe">{g.navn}</p>}
          <ul className="hl-liste">
            {g.rader.map((r) => {
              const pa = kryss.get(r.id) ?? r.avkrysset;
              return (
                <li key={r.id} className={pa ? "hl-rad pa" : "hl-rad"}>
                  <button
                    type="button"
                    className="hl-kryss"
                    role="checkbox"
                    aria-checked={pa}
                    aria-label={r.tittel}
                    onClick={() =>
                      start(async () => {
                        settKryss({ id: r.id, pa: !pa });
                        await settAvkrysset(r.id, !pa);
                      })
                    }
                  >
                    {pa ? "✓" : ""}
                  </button>
                  <Link href={`/handleliste/${r.id}`} className="hl-tekst">
                    <b>{r.tittel}</b>
                    {r.under && <small>{r.under}</small>}
                    {r.tilbud && <small className="hl-tilbud">{r.tilbud}</small>}
                    {r.forskjell && <small className={r.forskjell.bra ? "hl-spart" : undefined}>{r.forskjell.tekst}</small>}
                  </Link>
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
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
