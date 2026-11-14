"use client";

import { useFormStatus } from "react-dom";

export function SendKnapp() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primar" disabled={pending}>
      {pending ? "Sender …" : "Send til handlelisten"}
    </button>
  );
}
