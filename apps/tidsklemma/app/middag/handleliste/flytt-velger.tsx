"use client";

import { flyttVare } from "../actions";

type Valg = { kode: string; navn: string; pris: number | null; tilbud: boolean; anslag: boolean };

const kr = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

/** Flytt en vare til en annen butikk. Viser prisen i hver butikk, så man ser hva det koster. */
export function FlyttVelger({ uke, innkjop, butikk, valg, flyttet }: { uke: string; innkjop: string; butikk: string; valg: Valg[]; flyttet: boolean }) {
  return (
    <form action={flyttVare} className="hl-flytt">
      <input type="hidden" name="uke" value={uke} />
      <input type="hidden" name="innkjop" value={innkjop} />
      <label>
        <span className="visuelt-skjult">Kjøp hos</span>
        <select name="butikk" defaultValue={butikk} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Kjøp hos">
          {valg.map((v) => (
            <option key={v.kode} value={v.kode}>
              {v.navn}
              {v.pris != null ? ` · ${kr.format(v.pris)} kr${v.tilbud ? " (tilbud)" : v.anslag ? " (anslag)" : ""}` : " · ingen pris"}
            </option>
          ))}
        </select>
      </label>
      {flyttet && <span className="dempet"> · flyttet</span>}
    </form>
  );
}
