import Link from "next/link";
import { bekreftKode, loggInn } from "../actions";

/** Skriv inn koden fra e-posten. iPhone foreslår koden over tastaturet når e-posten har kommet. */
export function Kode({ epost, feil }: { epost: string; feil?: string }) {
  return (
    <div className="bunnknapper">
      <form action={bekreftKode}>
        <input type="hidden" name="email" value={epost} />
        <label htmlFor="kode" className="kt">
          Kode fra e-posten
        </label>
        <p className="dempet liten" style={{ marginTop: 0 }}>
          Sendt til {epost}. Sjekk søppelpost hvis den ikke kommer.
        </p>
        <input
          id="kode"
          name="kode"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,12}"
          maxLength={12}
          autoFocus
          placeholder="Kode"
          className="felt kodefelt"
        />
        {feil === "kode" && <p className="feil">Koden stemmer ikke, eller er for gammel. Prøv igjen, eller be om en ny.</p>}
        {feil === "vent" && <p className="feil">Vent litt før du ber om en ny kode. Bruk koden du allerede har fått.</p>}
        <button type="submit" className="primar">
          Logg inn
        </button>
      </form>
      <form action={loggInn}>
        <input type="hidden" name="email" value={epost} />
        <button type="submit" className="lenke">
          Send ny kode
        </button>
      </form>
      <Link href="/logg-inn" className="lenke">
        Bruk en annen e-post
      </Link>
    </div>
  );
}
