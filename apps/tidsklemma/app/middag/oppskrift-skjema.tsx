import { lagreOppskrift } from "./actions";
import type { Oppskrift } from "./data";
import { MerkelappFelt } from "./merkelapp-felt";

/** Skjema for ny oppskrift skrevet inn for hånd, og for å endre en oppskrift. */
export function OppskriftSkjema({ o, brukte }: { o?: Oppskrift; brukte: string[] }) {
  return (
    <form action={lagreOppskrift}>
      {o && <input type="hidden" name="oppskrift" value={o.id} />}
      <label htmlFor="navn" className="kt">
        Navn
      </label>
      <input id="navn" name="navn" required maxLength={200} defaultValue={o?.navn} className="felt" autoFocus={!o} />

      <div className="to-felt">
        <label>
          <span className="kt">Minutter</span>
          <input name="minutter" type="number" inputMode="numeric" min={1} max={1440} defaultValue={o?.minutter ?? ""} className="felt" />
        </label>
        <label>
          <span className="kt">Porsjoner</span>
          <input name="porsjoner" type="number" inputMode="numeric" min={1} max={100} defaultValue={o?.porsjoner ?? ""} className="felt" />
        </label>
      </div>

      <label htmlFor="ingredienser" className="kt">
        Ingredienser <span className="valgfritt">(én per linje)</span>
      </label>
      <textarea id="ingredienser" name="ingredienser" rows={8} defaultValue={o?.ingredienser.join("\n")} placeholder={"400 g kyllingfilet\n1 boks kokosmelk"} className="felt" />

      <label htmlFor="fremgangsmaate" className="kt">
        Fremgangsmåte <span className="valgfritt">(valgfritt)</span>
      </label>
      <textarea id="fremgangsmaate" name="fremgangsmaate" rows={6} defaultValue={o?.fremgangsmaate} className="felt" />

      <MerkelappFelt start={o?.merkelapper ?? []} brukte={brukte} />

      <label htmlFor="lenke" className="kt">
        Lenke <span className="valgfritt">(valgfritt)</span>
      </label>
      <input id="lenke" name="lenke" type="url" inputMode="url" defaultValue={o?.lenke ?? ""} className="felt" />

      <label className="avkryss">
        <input type="checkbox" name="favoritt" value="1" defaultChecked={o?.favoritt} />
        <span>
          <b>★ Stjernemerket</b>
          <small className="dempet liten">Foreslås oftere i ukesmenyen</small>
        </span>
      </label>
      <label className="avkryss">
        <input type="checkbox" name="trygg" value="1" defaultChecked={o?.trygg} />
        <span>
          <b>Trygg som den er</b>
          <small className="dempet liten">Allerede tilpasset allergiene våre, skal ikke endres</small>
        </span>
      </label>

      <button type="submit" className="primar" style={{ marginTop: 12 }}>
        Lagre
      </button>
    </form>
  );
}
