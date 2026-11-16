"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const NY = "__ny__";

/**
 * Butikken nye varer havner på. Med `fritekst` gir «Annen butikk …» et felt for en hvilken som helst butikk,
 * f.eks. «Clas Ohlson». Går tilbake til «Uspesifisert butikk» når varene er lagt til.
 */
export function ButikkVelger({ valg, fritekst }: { valg: { kode: string; navn: string }[]; fritekst: boolean }) {
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
      <label className="visuelt-skjult" htmlFor="butikk">
        Butikk
      </label>
      <select id="butikk" name="butikk" value={butikk} onChange={(e) => setButikk(e.target.value)} className="felt">
        <option value="">Uspesifisert butikk</option>
        {valg.map((b) => (
          <option key={b.kode} value={b.kode}>
            {b.navn}
          </option>
        ))}
        {fritekst && <option value={NY}>Annen butikk …</option>}
      </select>
      {butikk === NY && (
        <>
          <label className="visuelt-skjult" htmlFor="ny_butikk">
            Navn på butikken
          </label>
          <input
            id="ny_butikk"
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
        </>
      )}
    </>
  );
}
