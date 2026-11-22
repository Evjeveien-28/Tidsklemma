"use client";

import Link from "next/link";
import { useRef, useState } from "react";

/** Hvor langt raden skyves for å vise knappene (px), og hvor langt man må dra før den blir stående åpen. */
const KNAPPER = 152;
const TERSKEL = 50;

/**
 * En rad i en avkrysningsliste (Handleliste, Pakkeliste). Trykk hvor som helst på raden for å krysse av.
 * Dra raden til venstre for å få fram Rediger og Fjern. Uten sveip (mus, tastatur, skjermleser) gjør ⋯ det samme.
 * Innholdet (navn, pris osv.) kommer som children, og vises ved siden av avkrysningsboksen.
 */
export function SveipRad({
  navn,
  pa,
  apen,
  settApen,
  kryss,
  fjern,
  redigerHref,
  ekstra,
  children,
}: {
  /** Til skjermlesere, f.eks. «Rediger eller fjern melk». */
  navn: string;
  pa: boolean;
  apen: boolean;
  settApen: (ja: boolean) => void;
  kryss: (pa: boolean) => void;
  /** Uten fjern (f.eks. i en låst liste) vises bare Rediger. */
  fjern?: () => void;
  redigerHref: string;
  /** Noe ved siden av raden, utenfor avkrysningen, f.eks. en lenke som åpner varen. */
  ekstra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; fra: number } | null>(null);
  const retning = useRef<"vannrett" | "loddrett" | null>(null);
  const dratt = useRef(false);
  const bredde = fjern ? KNAPPER : KNAPPER / 2;

  const forskyvning = dx ?? (apen ? -bredde : 0);

  const ned = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, fra: apen ? -bredde : 0 };
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
    setDx(Math.max(-bredde - 30, Math.min(0, s.fra + ddx)));
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
      <div className="hl-handlinger" aria-hidden={!apen} style={{ width: bredde }}>
        <Link href={redigerHref} className="hl-rediger" tabIndex={apen ? 0 : -1}>
          Rediger
        </Link>
        {fjern && (
          <button type="button" className="hl-fjern" onClick={fjern} tabIndex={apen ? 0 : -1}>
            Fjern
          </button>
        )}
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
          {children}
        </button>
        {ekstra}
        <button type="button" className="hl-mer" aria-label={`Rediger eller fjern ${navn}`} aria-expanded={apen} onClick={() => settApen(!apen)}>
          ⋯
        </button>
      </div>
    </li>
  );
}
