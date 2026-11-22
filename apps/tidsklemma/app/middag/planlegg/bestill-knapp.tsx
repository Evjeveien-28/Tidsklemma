"use client";

import { useFormStatus } from "react-dom";

export function BestillKnapp({ uke }: { uke: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primar" disabled={pending} style={{ marginTop: 8 }}>
      {pending ? "Bestiller …" : `Lag forslag for ${uke.toLowerCase()}`}
    </button>
  );
}
