"use client";

import { useFormStatus } from "react-dom";

export function LeggTilKnapp() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="pluss" disabled={pending} aria-label="Legg til">
      {pending ? "…" : "+"}
    </button>
  );
}
