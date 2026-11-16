"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

/** Hvor langt raden skyves for å vise knappene (px), og hvor langt man må dra før den blir stående åpen. */
const KNAPPER = 152;
const TERSKEL = 50;

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
                  r={r}
                  pa={tilstand.get(r.id)?.pa ?? r.avkrysset}
                  apen={apen === r.id}
                  settApen={(ja) => setApen(ja ? r.id : null)}
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
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function SveipRad({
  r,
  pa,
  apen,
  settApen,
  kryss,
  fjern,
}: {
  r: Rad;
  pa: boolean;
  apen: boolean;
  settApen: (ja: boolean) => void;
  kryss: (pa: boolean) => void;
  fjern: () => void;
}) {
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; fra: number } | null>(null);
  const retning = useRef<"vannrett" | "loddrett" | null>(null);
  const dratt = useRef(false);

  const forskyvning = dx ?? (apen ? -KNAPPER : 0);

  const ned = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, fra: apen ? -KNAPPER : 0 };
    retning.current = null;
    dratt.current = false;
  };
  const flytt = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!retning.current) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      retning.current = Math.abs(ddx) > Math.abs(ddy) ? "vannrett" : "loddrett";
      if (retning.current === "vannrett") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (retning.current !== "vannrett") return;
    dratt.current = true;
    setDx(Math.max(-KNAPPER - 30, Math.min(0, s.fra + ddx)));
  };
  const slipp = () => {
    if (start.current && retning.current === "vannrett" && dx != null) settApen(dx < -TERSKEL);
    start.current = null;
    setDx(null);
  };
  const trykk = () => {
    // Et drag er ikke et trykk. En åpen rad lukkes i stedet for å krysses av.
    if (dratt.current) return;
    if (apen) return settApen(false);
    kryss(!pa);
  };

  return (
    <li className={pa ? "hl-rad hl-sveip pa" : "hl-rad hl-sveip"}>
      <div className="hl-handlinger" aria-hidden={!apen}>
        <Link href={`/handleliste/${r.id}`} className="hl-rediger" tabIndex={apen ? 0 : -1}>
          Rediger
        </Link>
        <button type="button" className="hl-fjern" onClick={fjern} tabIndex={apen ? 0 : -1}>
          Fjern
        </button>
      </div>
      <div
        className="hl-forgrunn"
        style={{ transform: `translateX(${forskyvning}px)`, transition: dx == null ? "transform 0.2s" : "none" }}
        onPointerDown={ned}
        onPointerMove={flytt}
        onPointerUp={slipp}
        onPointerCancel={slipp}
      >
        <button type="button" className="hl-trykk" role="checkbox" aria-checked={pa} onClick={trykk}>
          <span className="hl-kryss" aria-hidden>
            {pa ? "✓" : ""}
          </span>
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
        </button>
        {/* Uten sveip (tastatur, skjermleser, mus): en egen knapp som åpner handlingene. */}
        <button type="button" className="hl-mer" aria-label={`Rediger eller fjern ${r.tittel}`} aria-expanded={apen} onClick={() => settApen(!apen)}>
          ⋯
        </button>
      </div>
    </li>
  );
}
