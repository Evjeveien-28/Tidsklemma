"use client";

import { useFormStatus } from "react-dom";

/** «+» under feltene, over hele bredden. */
export function LeggTilKnapp() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="hl-legg-til" disabled={pending} aria-label="Legg til">
      {pending ? "…" : "+"}
    </button>
  );
}
