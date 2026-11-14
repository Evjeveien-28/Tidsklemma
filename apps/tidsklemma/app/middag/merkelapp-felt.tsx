"use client";

import { useState } from "react";
import { lesMerkelapper } from "./lese";

/** Merkelapper skilt med komma, med de som er brukt før som knapper man kan trykke på. */
export function MerkelappFelt({ start, brukte }: { start: string[]; brukte: string[] }) {
  const [tekst, setTekst] = useState(start.join(", "));
  const valgte = lesMerkelapper(tekst);
  const forslag = brukte.filter((m) => !valgte.includes(m));
  return (
    <>
      <label htmlFor="merkelapper" className="kt">
        Merkelapper <span className="valgfritt">(skill med komma)</span>
      </label>
      <input
        id="merkelapper"
        name="merkelapper"
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        placeholder="rask, vegetar, barnevennlig"
        autoComplete="off"
        className="felt"
      />
      {forslag.length > 0 && (
        <div className="merkelapp-forslag" aria-label="Brukt før">
          {forslag.map((m) => (
            <button key={m} type="button" className="merkelapp" onClick={() => setTekst([...valgte, m].join(", "))}>
              + {m}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
