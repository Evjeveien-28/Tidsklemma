"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Henter siden på nytt hvert 20. sekund mens menyen lages, så den nye dukker opp av seg selv. */
export function Oppdater() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
