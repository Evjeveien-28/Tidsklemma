"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const NY = "__ny__";

/**
 * Butikken nye varer havner på. «Ny butikk …» gir et felt for en egen butikk, f.eks. «Clas Ohlson», som huskes
 * til neste gang (bare i Handleliste). Går tilbake til «Uspesifisert» når varene er lagt til.
 */
export function ButikkVelger({ valg }: { valg: { kode: string; navn: string }[] }) {
  const { pending } = useFormStatus();
  const [butikk, setButikk] = useState("");
  const [ny, setNy] = useState("");
  const nyFelt = useRef<HTMLInputElement>(null);
  const forrige = useRef(pending);
  useEffect(() => {
    if (forrige.current && !pending) {
      setButikk("");
      setNy("");
    }
    forrige.current = pending;
  }, [pending]);
  useEffect(() => {
    if (butikk === NY) nyFelt.current?.focus();
  }, [butikk]);

  return (
    <>
      <label className="hl-ny-butikk">
        <span className="dempet">Butikk</span>
        <select name="butikk" value={butikk} onChange={(e) => setButikk(e.target.value)} className="felt">
          <option value="">Uspesifisert</option>
          {valg.map((b) => (
            <option key={b.kode} value={b.kode}>
              {b.navn}
            </option>
          ))}
          <option value={NY}>Ny butikk …</option>
        </select>
      </label>
      {butikk === NY && (
        <label className="hl-ny-butikk">
          <span className="visuelt-skjult">Navn på butikken</span>
          <input
            ref={nyFelt}
            name="ny_butikk"
            value={ny}
            onChange={(e) => setNy(e.target.value)}
            required
            maxLength={40}
            autoComplete="off"
            placeholder="F.eks. Clas Ohlson"
            className="felt"
          />
        </label>
      )}
    </>
  );
}
