"use client";

import { useState } from "react";

/**
 * Lenken på en vare, til høyre i raden: miniatyrbildet fra siden, som åpner den i en ny fane.
 * Uten bilde (eller hvis det ikke laster) vises ↗ i stedet.
 */
export function LenkeKnapp({ lenke, bilde, navn }: { lenke: string; bilde: string | null; navn: string }) {
  const [feil, setFeil] = useState(false);
  return (
    <a href={lenke} target="_blank" rel="noopener noreferrer" className="hl-lenke" aria-label={`Åpne lenken til ${navn}`} title="Åpne lenken">
      {bilde && !feil ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bilde} alt="" className="hl-mini" loading="lazy" referrerPolicy="no-referrer" onError={() => setFeil(true)} />
      ) : (
        "↗"
      )}
    </a>
  );
}
