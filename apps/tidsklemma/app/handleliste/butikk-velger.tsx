"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Butikken nye varer havner på. Går tilbake til «Uspesifisert» når varene er lagt til. */
export function ButikkVelger({ valg }: { valg: { kode: string; navn: string }[] }) {
  const { pending } = useFormStatus();
  const [butikk, setButikk] = useState("");
  const forrige = useRef(pending);
  useEffect(() => {
    if (forrige.current && !pending) setButikk("");
    forrige.current = pending;
  }, [pending]);
  return (
    <label className="hl-ny-butikk">
      <span className="dempet">Butikk</span>
      <select name="butikk" value={butikk} onChange={(e) => setButikk(e.target.value)} className="felt">
        <option value="">Uspesifisert</option>
        {valg.map((b) => (
          <option key={b.kode} value={b.kode}>
            {b.navn}
          </option>
        ))}
      </select>
    </label>
  );
}
