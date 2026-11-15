import Link from "next/link";
import { Side } from "./side";

/** Siden finnes ikke, f.eks. en oppskrift som er slettet. */
export default function IkkeFunnet() {
  return (
    <Side tittel="Fant ikke siden" tilbake={{ href: "/", navn: "Hjem" }}>
      <p>Den kan være slettet, eller lenken er feil.</p>
      <Link href="/" className="sekundar" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
        Til forsiden
      </Link>
    </Side>
  );
}
