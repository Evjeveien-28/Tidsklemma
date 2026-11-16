import { createClient } from "@hjem/db/server";
import { DatabaseFeil } from "../database-feil";
import { BUTIKKER, butikkNavn } from "../middag/butikker";
import { hentHusstand } from "../planter/data";
import { Side } from "../side";
import { fjernAvkryssede, leggTil } from "./actions";
import { anslag, finnTilbud, hentEgneButikker, hentVarer, kr, produktTekst, type Vare } from "./data";
import { ButikkVelger } from "./butikk-velger";
import { LeggTilKnapp } from "./legg-til-knapp";
import { Liste, type Rad } from "./liste";

const tilbake = { href: "/", navn: "Tilbake" };

const kroner = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/** For varer fra Middag: merke ved prisen, og forskjellen mot den billigste av de andre butikkene i fordelingen. */
function middagInfo(v: Vare): Pick<Rad, "merke" | "forskjell"> {
  const m = v.produkt?.middag;
  const her = m && v.butikk ? m.priser[v.butikk] : undefined;
  if (!m || !her || her.pris == null) return { merke: null, forskjell: null };
  const andre = m.fordeling
    .filter((b) => b !== v.butikk)
    .map((b) => ({ b, pris: m.priser[b]?.pris }))
    .filter((x): x is { b: string; pris: number } => x.pris != null)
    .sort((a, b) => a.pris - b.pris)[0];
  const diff = andre ? (andre.pris - her.pris) * v.antall : 0;
  return {
    merke: her.tilbud ? "tilbud" : her.anslag ? "anslag" : null,
    forskjell: andre && Math.abs(diff) >= 1 ? { tekst: `${diff > 0 ? "−" : "+"}${kroner.format(Math.abs(diff))} kr mot ${butikkNavn(andre.b)}`, bra: diff > 0 } : null,
  };
}

function tilRad(v: Vare, tilbud: Parameters<typeof finnTilbud>[1]): Rad {
  const pris = anslag(v);
  const her = v.butikk ? v.produkt?.middag?.priser[v.butikk] : undefined;
  // Fra middagsmenyen med butikk: butikken og prisen er alt valgt der, så ikke foreslå tilbud andre steder.
  const fraMeny = v.kilde === "middag" && v.produkt?.id === 0;
  const t = fraMeny && v.butikk ? null : finnTilbud(v.navn, tilbud);
  return {
    id: v.id,
    tittel: `${v.antall !== 1 ? `${String(v.antall).replace(".", ",")} × ` : ""}${v.navn}`,
    under: v.uten_pris
      ? null
      : fraMeny
        ? [v.produkt!.ekstra, (her ? her.tilbud : v.produkt!.tilbud) && v.butikk && `Tilbud hos ${butikkNavn(v.butikk)}`].filter(Boolean).join(" · ") || null
        : v.produkt
          ? `${produktTekst(v.produkt)}${v.produkt.tilbud ? ` · Oda: ${v.produkt.tilbud}` : ""}`
          : "Fant ikke pris",
    tilbud: t ? `Tilbud hos ${butikkNavn(t.butikk)}: ${t.navn.charAt(0) + t.navn.slice(1).toLowerCase()}, ${kr(t.pris)}` : null,
    pris: pris != null ? (v.produkt?.middag ? kr(pris) : `ca. ${kr(pris)}`) : null,
    ...middagInfo(v),
    avkrysset: v.avkrysset_at != null,
  };
}

export default async function Handleliste() {
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) return <Side tittel="Handleliste" tilbake={tilbake}><p>Du er ikke medlem av en husstand ennå.</p></Side>;

  let varer: Vare[];
  try {
    varer = await hentVarer(supabase, husstand.id);
  } catch (e) {
    return (
      <Side tittel="Handleliste" tilbake={tilbake}>
        <DatabaseFeil melding={e instanceof Error ? e.message : String(e)} hva="handlelisten" schema="handleliste" tabeller="handleliste.varer" />
      </Side>
    );
  }
  // Ukens tilbud fra Middag, hvis den delen er satt opp.
  const { data: tilbud } = await supabase.schema("middag").from("tilbud").select("butikk, navn, pris, gyldig_til").eq("household_id", husstand.id);
  const ukensTilbud = ((tilbud ?? []) as { butikk: string; navn: string; pris: number; gyldig_til: string }[]).map((t) => ({ ...t, pris: Number(t.pris) }));
  const { data: inn } = await supabase.schema("middag").from("innstillinger").select("butikker").eq("household_id", husstand.id).maybeSingle();
  const rekkefolge = ((inn?.butikker as string[] | undefined) ?? []);
  // Butikkene man kan velge når man legger til: husstandens fra Middag, ellers alle.
  const kjeder = rekkefolge.length ? rekkefolge.map((k) => ({ kode: k, navn: butikkNavn(k) })) : BUTIKKER.map((b) => ({ kode: b.kode, navn: b.navn }));
  // Pluss egne butikker, f.eks. «Clas Ohlson». Der er navnet også koden.
  const egne = await hentEgneButikker(supabase, husstand.id, varer, new Set(BUTIKKER.map((b) => b.kode)));
  const valgbare = [...kjeder, ...egne.filter((n) => !kjeder.some((k) => k.kode === n)).map((n) => ({ kode: n, navn: n }))];

  const igjen = varer.filter((v) => !v.avkrysset_at);
  const kurven = varer.filter((v) => v.avkrysset_at);
  const priser = igjen.map(anslag);
  const sum = priser.reduce<number>((a, p) => a + (p ?? 0), 0);
  const utenPris = priser.filter((p) => p == null).length;

  // Varer med butikk samles under butikken, i husstandens rekkefølge. Resten først, uten overskrift.
  const butikker = [...new Set(igjen.map((v) => v.butikk).filter((b): b is string => !!b))].sort(
    (a, b) => (rekkefolge.indexOf(a) + 1 || 99) - (rekkefolge.indexOf(b) + 1 || 99),
  );
  const grupper = [
    { navn: butikker.length ? "Uspesifisert" : null, rader: igjen.filter((v) => !v.butikk).map((v) => tilRad(v, ukensTilbud)) },
    ...butikker.map((b) => ({ navn: butikkNavn(b), rader: igjen.filter((v) => v.butikk === b).map((v) => tilRad(v, ukensTilbud)) })),
  ].filter((g) => g.rader.length > 0);

  return (
    <Side tittel="Handleliste" tilbake={tilbake}>
      <form action={leggTil} className="hl-ny">
        <label htmlFor="tekst" className="visuelt-skjult">
          Legg til varer
        </label>
        <input id="tekst" name="tekst" required maxLength={500} autoComplete="off" placeholder="F.eks. melk, 2 brød, oppvaskmiddel" className="felt" />
        <LeggTilKnapp />
        <ButikkVelger valg={valgbare} />
      </form>

      {igjen.length > 0 && (
        <p className="hl-sum">
          <b>
            {igjen.length} {igjen.length === 1 ? "vare" : "varer"}
            {sum > 0 && ` · ca. ${kr(sum, true)} kr`}
          </b>
          {utenPris > 0 && sum > 0 && <span className="dempet liten"> ({utenPris} uten pris)</span>}
        </p>
      )}

      {igjen.length === 0 && kurven.length === 0 ? (
        <div className="kort stiplet">
          <p className="kt">Tom liste</p>
          <p>Skriv inn det dere trenger. Flere varer på én gang med komma. Prisen anslås fra Oda.</p>
        </div>
      ) : igjen.length === 0 ? (
        <p className="dempet">Alt er krysset av.</p>
      ) : (
        <Liste grupper={grupper} />
      )}

      {kurven.length > 0 && (
        <details className="hl-kurv">
          <summary className="kt">I handlekurven ({kurven.length})</summary>
          <Liste grupper={[{ navn: null, rader: kurven.map((v) => tilRad(v, ukensTilbud)) }]} />
          <form action={fjernAvkryssede}>
            <button type="submit" className="lenke">
              Fjern avkryssede
            </button>
          </form>
        </details>
      )}
      <p className="dempet liten" style={{ marginTop: "auto", paddingTop: 20, textAlign: "center" }}>
        {varer.some((v) => v.produkt?.middag) ? (
          <>
            Varer fra Middag: <span className="pmerke tilbud">%</span> tilbud, <span className="pmerke anslag">≈</span> anslått med Odas pris. Trykk på en
            vare for å flytte den til en annen butikk.
            <br />
          </>
        ) : null}
        Andre priser er anslag fra Oda. I lavpriskjedene er det ofte litt billigere.
      </p>
    </Side>
  );
}
