import type { Person } from "../husstand/personer";
import type { Tur } from "./data";

/** Felles skjema for ny tur og endring av en tur. */
export function TurSkjema({
  tur,
  personer,
  handling,
  knapp,
  nyRunde = false,
}: {
  tur?: Tur;
  personer: Person[];
  handling: (fd: FormData) => Promise<void>;
  knapp: string;
  /** Vis «Be agenten se på listen på nytt» (når man endrer en tur som ikke er låst). */
  nyRunde?: boolean;
}) {
  const iar = new Date().getFullYear();
  return (
    <form action={handling}>
      {tur && <input type="hidden" name="tur" value={tur.id} />}
      <label htmlFor="tittel" className="kt">
        Hva skal dere?
      </label>
      <input id="tittel" name="tittel" required maxLength={80} defaultValue={tur?.tittel} placeholder="F.eks. Hytta på Hafjell" className="felt" />

      <label htmlFor="beskrivelse" className="kt">
        Fortell litt om turen <span className="valgfritt">(valgfritt)</span>
      </label>
      <textarea
        id="beskrivelse"
        name="beskrivelse"
        rows={3}
        maxLength={2000}
        defaultValue={tur?.beskrivelse}
        placeholder="F.eks. skikjøring hver dag, en middag ute, badstue på hytta"
        className="felt"
      />

      <label htmlFor="sted" className="kt">
        Hvor <span className="valgfritt">(valgfritt)</span>
      </label>
      <input id="sted" name="sted" maxLength={120} defaultValue={tur?.sted} placeholder="F.eks. Hafjell eller Gran Canaria" className="felt" />
      <p className="dempet liten" style={{ marginTop: -6 }}>
        Brukes til været. Står det tomt, finner vi stedet i teksten over hvis det står der.
      </p>

      <div className="to-felt">
        <label>
          <span className="kt">Fra</span>
          <input name="fra" type="date" required defaultValue={tur?.fra} className="felt" />
        </label>
        <label>
          <span className="kt">
            Til <span className="valgfritt">(valgfritt)</span>
          </span>
          <input name="til" type="date" defaultValue={tur?.til} className="felt" />
        </label>
      </div>

      <p className="kt" style={{ marginBottom: 0 }}>
        Hvem skal være med
      </p>
      <div className="chips">
        {personer.map((p) => (
          <label key={p.id} className="chip-avkryss">
            <input type="checkbox" name="person" value={p.id} defaultChecked={tur ? tur.personer.includes(p.id) : true} />
            <span>
              {p.navn}
              {p.fodselsar && iar - p.fodselsar < 18 ? ` (${iar - p.fodselsar})` : ""}
            </span>
          </label>
        ))}
      </div>

      {nyRunde && (
        <label className="avkryss">
          <input type="checkbox" name="ny_runde" value="1" defaultChecked />
          <span>
            <b>Be agenten se på listen på nytt</b>
            <small className="dempet liten">Den legger til det som mangler, og kan fjerne sine egne forslag som ikke passer lenger. Det dere har lagt til selv, blir stående.</small>
          </span>
        </label>
      )}

      <button type="submit" className="primar" style={{ marginTop: 12 }}>
        {knapp}
      </button>
    </form>
  );
}
