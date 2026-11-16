"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Hvor langt man må dra (i px) før siden oppdateres når man slipper. */
const TERSKEL = 70;
/** Hvor langt indikatoren kan dras ned. */
const MAKS = 110;

/**
 * «Dra ned for å oppdatere» når appen er lagt på hjemskjermen. Der har man ingen oppdater-knapp,
 * og iOS har ikke dra-ned-for-å-oppdatere selv. Henter også siden på nytt når appen kommer tilbake i forgrunnen.
 * I nettleseren gjør vi ingenting, der har den sin egen.
 */
export function DraForOppdatering() {
  const router = useRouter();
  const [avstand, setAvstand] = useState(0);
  const [laster, startOppdatering] = useTransition();
  const start = useRef<number | null>(null);
  const naa = useRef(0);

  useEffect(() => {
    const hjemskjerm =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!hjemskjerm) return;

    const oppdater = () => startOppdatering(() => router.refresh());

    const ned = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0]!.clientY : null;
    };
    const flytt = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0]!.clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        naa.current = 0;
        setAvstand(0);
        return;
      }
      // Litt motstand, så det kjennes som å dra i noe.
      naa.current = Math.min(MAKS, dy * 0.5);
      setAvstand(naa.current);
    };
    const slipp = () => {
      if (start.current != null && naa.current >= TERSKEL) oppdater();
      start.current = null;
      naa.current = 0;
      setAvstand(0);
    };
    const synlig = () => {
      if (document.visibilityState === "visible") oppdater();
    };

    window.addEventListener("touchstart", ned, { passive: true });
    window.addEventListener("touchmove", flytt, { passive: true });
    window.addEventListener("touchend", slipp);
    window.addEventListener("touchcancel", slipp);
    document.addEventListener("visibilitychange", synlig);
    return () => {
      window.removeEventListener("touchstart", ned);
      window.removeEventListener("touchmove", flytt);
      window.removeEventListener("touchend", slipp);
      window.removeEventListener("touchcancel", slipp);
      document.removeEventListener("visibilitychange", synlig);
    };
  }, [router]);

  const vis = laster ? TERSKEL * 0.6 : avstand;
  if (vis <= 0) return null;
  const klar = avstand >= TERSKEL;
  return (
    <div className="dra-oppdater" style={{ transform: `translate(-50%, ${vis - 44}px)` }} role="status" aria-live="polite">
      <span className={laster ? "dra-snurr" : undefined} style={laster ? undefined : { transform: `rotate(${klar ? 180 : (avstand / TERSKEL) * 180}deg)` }}>
        {laster ? "↻" : "↓"}
      </span>
      <span className="visuelt-skjult">{laster ? "Oppdaterer" : klar ? "Slipp for å oppdatere" : "Dra ned for å oppdatere"}</span>
    </div>
  );
}
