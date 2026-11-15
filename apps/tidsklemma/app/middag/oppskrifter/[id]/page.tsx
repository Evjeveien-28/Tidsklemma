import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { Side } from "../../../side";
import { slettOppskrift } from "../../actions";
import { OPPSKRIFTFELT, type Oppskrift } from "../../data";
import { Bilde } from "../../bilde";
import { Stjerne } from "../../stjerne";
import { SlettKnapp } from "./slett-knapp";

export default async function OppskriftSide({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lest?: string; ulest?: string }> }) {
  const [{ id }, { lest, ulest }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.schema("middag").from("oppskrifter").select(OPPSKRIFTFELT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as Oppskrift;
  const meta = [o.minutter && `${o.minutter} min`, o.porsjoner && `${o.porsjoner} porsjoner`].filter(Boolean).join(" · ");

  return (
    <Side tittel={o.navn} tilbake={{ href: "/middag/oppskrifter", navn: "Oppskrifter" }} handling={<Stjerne id={o.id} pa={o.favoritt} />}>
      {lest && <p className="dempet">Hentet fra siden. Sjekk gjerne at alt ble riktig.</p>}
      {(ulest || o.trenger_utfylling) && (
        <div className="kort stiplet">
          <p className="kt">Mangler ingredienser</p>
          <p>Fant ikke oppskriften i lesbar form på siden. Skriv inn ingrediensene under «Endre», så kan den komme med i ukesmenyen.</p>
        </div>
      )}
      <Bilde src={o.bilde_url} className="ostort" />
      {(meta || o.merkelapper.length > 0 || o.trygg) && (
        <p className="dempet">
          {[meta, ...o.merkelapper, o.trygg && "trygg som den er"].filter(Boolean).join(" · ")}
        </p>
      )}
      {o.lenke && (
        <p style={{ margin: "-4px 0 12px" }}>
          <a href={o.lenke} target="_blank" rel="noreferrer" className="inline-knapp" style={{ minHeight: 0 }}>
            Åpne original ›
          </a>
        </p>
      )}

      {o.ingredienser.length > 0 && (
        <>
          <p className="kt">Ingredienser</p>
          <ul className="ingredienser">
            {o.ingredienser.map((i, n) => (
              <li key={n}>{i}</li>
            ))}
          </ul>
        </>
      )}
      {o.fremgangsmaate && (
        <>
          <p className="kt">Fremgangsmåte</p>
          <ol className="fremgang">
            {o.fremgangsmaate.split("\n").filter(Boolean).map((s, n) => (
              <li key={n}>{s}</li>
            ))}
          </ol>
        </>
      )}

      <div className="bunnknapper">
        <Link href={`/middag/oppskrifter/${o.id}/endre`} className="sekundar" style={{ textAlign: "center", textDecoration: "none" }}>
          Endre
        </Link>
        <form action={slettOppskrift}>
          <input type="hidden" name="oppskrift" value={o.id} />
          <SlettKnapp navn={o.navn} />
        </form>
      </div>
    </Side>
  );
}
