"use client";

import { useState } from "react";

/** Bildet fra oppskriftssiden, eller en tallerken hvis det mangler eller ikke laster. */
export function Bilde({ src, className }: { src: string | null; className?: string }) {
  const [feil, setFeil] = useState(false);
  if (!src || feil) return className ? null : <span aria-hidden="true">🍽️</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFeil(true)} />;
}
