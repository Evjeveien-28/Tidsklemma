"use client";

import { useFormStatus } from "react-dom";

export function BestillKnapp() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primar" disabled={pending} style={{ marginTop: 8 }}>
      {pending ? "Bestiller …" : "Lag forslag"}
    </button>
  );
}
