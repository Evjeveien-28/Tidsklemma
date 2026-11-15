import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentHusstand } from "../../planter/data";
import { Side } from "../../side";
import { sendTilHandleliste, settHjemme, velgFordeling } from "../actions";
import { butikkNavn } from "../butikker";
import { hentInnstillinger, hentMeny } from "../data";
import { ukensInnkjop } from "../egne";
import { prisHos, prisoversikt, summer } from "../pris";
import { SendKnapp } from "./send-knapp";

const kroner = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const ore = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kr = (n: number) => (Number.isInteger(n) ? kroner.format(n) : ore.format(n));

export default async function MiddagHandleliste({ searchParams }: { searchParams: Promise<{ uke?: string; feil?: string }> }) {
  const { uke, feil } = await searchParams;
  if (!uke || !/^\d{4}-\d{2}-\d{2}$/.test(uke)) notFound();
  const supabase = await createClient();
  const husstand = await hentHusstand(supabase);
  if (!husstand) notFound();
  const [meny, inn, { count: sendt }] = await Promise.all([
    hentMeny(supabase, husstand.id, uke),
    hentInnstillinger(supabase, husstand.id),
    supabase.schema("handleliste").from("varer").select("id", { count: "exact", head: true }).eq("household_id", husstand.id).eq("kilde", "middag").eq("kilde_uke", uke),
  ]);
  if (!meny) notFound();

  const { innkjop, hjemme } = await ukensInnkjop(supabase, meny, inn.basisvarer);
  const oversikt = prisoversikt(innkjop, inn.butikker, inn.maks_butikker, meny.valg.fordeling);
  const aktiv = oversikt.aktiv ?? summer(innkjop, inn.butikker.slice(0, 1));
  const valgt = aktiv.butikker;
  const nokkel = (b: string[]) => b.join(",");

  return (
    <Side tittel="Handleliste for uka" tilbake={{ href: `/middag?uke=${uke}`, navn: "Middag" }}>
      <section className="kort">
        <p className="kt">Hvor handler vi</p>
        <form action={velgFordeling}>
          <input type="hidden" name="uke" value={uke} />
          {oversikt.alternativer.map((s) => {
            const fordelt = s.butikker.length > 1;
            // Hva som kjøpes hvor, når handelen er fordelt: varene i de små butikkene, og resten i den største.
            const hvor = fordelt
              ? (() => {
                  const per = s.butikker
                    .map((b) => ({ b, varer: innkjop.filter((i) => s.plassering[i.id] === b) }))
                    .sort((a, b) => b.varer.length - a.varer.length);
                  const deler = per.slice(1).map((p) =>
                    p.varer.length <= 4
                      ? `${p.varer.map((i) => i.navn.split(" ")[0]).join(", ")} hos ${butikkNavn(p.b)}`
                      : `${p.varer.length} varer hos ${butikkNavn(p.b)}`,
                  );
                  return `${deler.join(", ")}, resten hos ${butikkNavn(per[0]!.b)}`;
                })()
              : null;
            return (
              <label key={nokkel(s.butikker)} className="radio mvalg">
                <input type="radio" name="butikker" value={nokkel(s.butikker)} defaultChecked={nokkel(s.butikker) === nokkel(valgt)} />
                <span>
                  <b>{fordelt ? s.butikker.map(butikkNavn).join(" + ") : `Alt hos ${butikkNavn(s.butikker[0]!)}`}</b>
                  <small className="dempet">
                    ca. {kroner.format(s.sum)} kr
                    {s.tilbud > 0 && ` · ${s.tilbud} på tilbud`}
                    {s.mangler > 0 && ` · ${s.mangler} uten pris`}
                  </small>
                  {hvor && <small className="dempet">{hvor}</small>}
                </span>
                {s.butikker.join(",") === oversikt.billigst?.butikker.join(",") ? (
                  <span className="mbillig">Billigst</span>
                ) : (
                  <span className="mpluss">
                    {s.ekstra < 0 ? "−" : "+"}
                    {kroner.format(Math.abs(s.ekstra))} kr
                  </span>
                )}
              </label>
            );
          })}
          <button type="submit" className="inline-knapp">
            Bruk valgt
          </button>
        </form>
        <p className="dempet liten">
          Tilbudspriser er fra kundeavisene. Andre varer har anslått vanlig pris fra Oda, så summene er omtrentlige. Forskjeller
          under ca. 10 kr regnes som like, og da velges butikkene dere har rangert høyest.
          {inn.maks_butikker > 1 && !oversikt.fordelt && " Det blir ikke billigere av å fordele handelen denne uka."}
        </p>
      </section>

      {feil && <p className="feil">Det gikk ikke å sende til handlelisten. Prøv igjen.</p>}

      <ul className="hl-liste">
        {innkjop.map((i) => {
          const butikk = aktiv.plassering[i.id] ?? valgt[0]!;
          const p = prisHos(i, butikk);
          return (
            <li key={i.id} className="hl-rad">
              <span className="hl-tekst" style={{ paddingLeft: 2 }}>
                <b>{i.navn}</b>
                <small>
                  {[valgt.length > 1 && butikkNavn(butikk), i.bruk].filter(Boolean).join(" · ")}
                </small>
                {p.tilbud && <small className="hl-tilbud">Tilbud hos {butikkNavn(butikk)}</small>}
              </span>
              <span className="hl-pris">{p.pris != null ? `ca. ${kr(p.pris)}` : "–"}</span>
              <form action={settHjemme}>
                <input type="hidden" name="uke" value={uke} />
                <input type="hidden" name="innkjop" value={i.id} />
                <input type="hidden" name="pa" value="1" />
                <button type="submit" className="liten-pil" aria-label={`Har ${i.navn} hjemme`} title="Har hjemme">
                  ✕
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {hjemme.length > 0 && (
        // Åpen når agenten har lagt inn rester fra forrige uke, så de blir sett og kan rettes.
        <details className="hl-kurv" open={hjemme.some((i) => i.rest && !(meny.valg.har ?? []).includes(i.id))}>
          <summary className="kt">Har hjemme ({hjemme.length})</summary>
          <ul className="hl-liste">
            {hjemme.map((i) => (
              <li key={i.id} className="hl-rad pa">
                <span className="hl-tekst">
                  <b>{i.navn}</b>
                  {i.rest && !(meny.valg.har ?? []).includes(i.id) && <small>{i.rest}</small>}
                </span>
                <form action={settHjemme}>
                  <input type="hidden" name="uke" value={uke} />
                  <input type="hidden" name="innkjop" value={i.id} />
                  <input type="hidden" name="pa" value="0" />
                  <button type="submit" className="inline-knapp">
                    Trenger likevel
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}

      <form action={sendTilHandleliste} className="bunnknapper">
        <input type="hidden" name="uke" value={uke} />
        <SendKnapp sendt={Boolean(sendt)} />
        <p className="dempet liten" style={{ textAlign: "center", margin: 0 }}>
          {sendt ? (
            <>
              Sendt til <Link href="/handleliste">Handleliste</Link>. Bytter du rett eller butikk, oppdateres den der også. Det du har kjøpt, blir stående.
            </>
          ) : (
            <>
              Varene legges i <Link href="/handleliste">Handleliste</Link>, med butikk. Bytter du rett etterpå, oppdateres listen der også.
            </>
          )}
        </p>
      </form>
    </Side>
  );
}
