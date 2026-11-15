"use client";

import { useFormStatus } from "react-dom";

export function SendKnapp({ sendt, oppdater = false }: { sendt: boolean; oppdater?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primar" disabled={pending}>
      {pending ? "Sender …" : oppdater ? "Oppdater handlelisten" : sendt ? "Åpne handlelisten" : "Send til handlelisten"}
    </button>
  );
}
