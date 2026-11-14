import { settFavoritt } from "./actions";

/** Stjerne av og på. Stjernemerkede oppskrifter velges oftere i ukesmenyen. */
export function Stjerne({ id, pa, tilbake }: { id: string; pa: boolean; tilbake?: "liste" }) {
  return (
    <form action={settFavoritt}>
      <input type="hidden" name="oppskrift" value={id} />
      <input type="hidden" name="pa" value={pa ? "0" : "1"} />
      {tilbake && <input type="hidden" name="tilbake" value={tilbake} />}
      <button type="submit" className={pa ? "stjerne pa" : "stjerne"} aria-pressed={pa} aria-label={pa ? "Fjern stjerne" : "Gi stjerne"}>
        {pa ? "★" : "☆"}
      </button>
    </form>
  );
}
