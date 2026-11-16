import Link from "next/link";
import { nyListe } from "./actions";
import { listeSti, type EgenListe } from "./data";

/**
 * Listene som faner øverst: Mat først (alltid der), så husstandens egne, og «+» for å lage en ny.
 * «+» er en vanlig lenke (?ny=1) som viser skjemaet under fanene.
 */
export function Faner({ lister, valgt, visNy }: { lister: EgenListe[]; valgt: string | null; visNy: boolean }) {
  const alle = [{ id: null, navn: "Mat" }, ...lister];
  const her = listeSti(valgt);
  return (
    <nav className="hl-faner" aria-label="Lister">
      {alle.map((l) => (
        <Link key={l.id ?? "mat"} href={listeSti(l.id)} className={l.id === valgt ? "hl-fane valgt" : "hl-fane"} aria-current={l.id === valgt ? "page" : undefined}>
          {l.navn}
        </Link>
      ))}
      <Link
        href={visNy ? her : `${her}${her.includes("?") ? "&" : "?"}ny=1`}
        className={visNy ? "hl-fane apen" : "hl-fane"}
        aria-label={visNy ? "Avbryt ny liste" : "Ny liste"}
        aria-expanded={visNy}
      >
        {visNy ? "×" : "+"}
      </Link>
      {visNy && (
        <form action={nyListe} className="hl-ny-liste-skjema">
          <label htmlFor="ny-liste" className="visuelt-skjult">
            Navn på listen
          </label>
          <input id="ny-liste" name="navn" required maxLength={40} autoComplete="off" autoFocus placeholder="F.eks. Jul, Hytta, Bursdag" className="felt" />
          <button type="submit" className="sekundar">
            Lag liste
          </button>
        </form>
      )}
    </nav>
  );
}
