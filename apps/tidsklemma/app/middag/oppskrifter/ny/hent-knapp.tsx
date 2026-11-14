"use client";

import { useFormStatus } from "react-dom";

export function HentKnapp() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primar" disabled={pending} style={{ marginTop: 10 }}>
      {pending ? "Henter oppskriften …" : "Hent oppskrift"}
    </button>
  );
}
