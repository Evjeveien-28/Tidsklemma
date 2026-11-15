"use client";

import { useFormStatus } from "react-dom";

export function SendKnapp({ sendt }: { sendt: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primar" disabled={pending}>
      {pending ? "Sender …" : sendt ? "Åpne handlelisten" : "Send til handlelisten"}
    </button>
  );
}
