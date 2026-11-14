"use client";

import { useFormStatus } from "react-dom";

export function HentKnapp() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="lenke" disabled={pending}>
      {pending ? "Henter tilbud …" : "Hent tilbudene på nytt nå"}
    </button>
  );
}
