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
import { FlyttVelger } from "./flytt-velger";
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
  const [meny, inn, { count: sendt, data: sist }] = await Promise.all([
    hentMeny(supabase, husstand.id, uke),
    hentInnstillinger(supabase, husstand.id),
    supabase
      .schema("handleliste")
      .from("varer")
      .select("created_at", { count: "exact" })
      .eq("household_id", husstand.id)
      .eq("kilde", "middag")
      .eq("kilde_uke", uke)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (!meny) notFound();
  // Har agenten laget menyen på nytt (f.eks. etter låsing) etter at den ble sendt, må Handleliste oppdateres.
  const utdatert = Boolean(sendt) && Boolean(sist?.[0]) && meny.laget_at > String(sist![0]!.created_at);

  const { innkjop, hjemme } = await ukensInnkjop(supabase, meny, inn.basisvarer);
  const oversikt = prisoversikt(innkjop, inn.butikker, inn.maks_butikker, meny.valg.fordeling, meny.valg.flytt);
  const aktiv = oversikt.aktiv ?? summer(innkjop, inn.butikker.slice(0, 1));
  const valgt = aktiv.butikker;
  const nokkel = (b: string[]) => b.join(",");
  // Med flere butikker grupperes varene per butikk, i rekkefølgen husstanden har rangert dem.
  const rader = innkjop.map((i) => {
    const butikk = aktiv.plassering[i.id] ?? valgt[0]!;
    const p = prisHos(i, butikk);
    // Forskjellen mot den billigste av de andre butikkene i fordelingen: positiv er spart, negativ er dyrere (flyttet vare).
    const alternativ = valgt
      .filter((b) => b !== butikk)
      .map((b) => ({ b, pris: prisHos(i, b).pris }))
      .filter((x): x is { b: string; pris: number } => x.pris != null)
      .sort((x, y) => x.pris - y.pris)[0];
    const spart = p.pris != null && alternativ && Math.abs(alternativ.pris - p.pris) >= 1 ? { kr: alternativ.pris - p.pris, mot: alternativ.b } : null;
    // Prisen i hver av husstandens butikker, til velgeren for å flytte varen.
    const valg = inn.butikker.map((b) => ({ kode: b, navn: butikkNavn(b), ...prisHos(i, b) }));
    return { i, butikk, p, spart, valg };
  });
  const grupper = (valgt.length > 1 ? valgt : [null]).map((b) => {
    const varer = b ? rader.filter((r) => r.butikk === b) : rader;
    return { butikk: b, varer, sum: varer.reduce((s, r) => s + (r.p.pris ?? 0), 0) };
  }).filter((g) => g.varer.length > 0);

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
                <input type="radio" name="butikker" value={nokkel(s.butikker)} defaultChecked={nokkel(s.butikker) === nokkel(oversikt.valgt?.butikker ?? valgt)} />
                <span>
                  <b>{fordelt ? s.butikker.map(butikkNavn).join(" + ") : `Alt hos ${butikkNavn(s.butikker[0]!)}`}</b>
                  <small className="dempet">
                    ca. {kroner.format(s.sum)} kr
                    {s.tilbud > 0 && ` · ${s.tilbud} på tilbud`}
                    {s.mangler > 0 && ` · ${s.mangler} uten pris`}
                    {s.anslag > 0 && ` · ${s.anslag === innkjop.length - s.mangler ? "alle" : s.anslag} anslått`}
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
          Tilbudspriser er fra kundeavisene. Meny, Spar, Joker og Oda har vanlige priser fra nettbutikkene. Kiwi, Rema og Coop har
          ikke priser på nett, så der er varene uten tilbud anslått med Odas pris, og summen kan være for lav. Forskjeller
          under ca. 10 kr regnes som like, og da velges butikkene dere har rangert høyest.
          {inn.maks_butikker > 1 && !oversikt.fordelt && " Det blir ikke billigere av å fordele handelen denne uka."}
        </p>
      </section>

      {feil && <p className="feil">Det gikk ikke å sende til handlelisten. Prøv igjen.</p>}

      {grupper.map((g) => (
        <section key={g.butikk ?? "alle"}>
          {g.butikk && (
            <p className="kt hl-gruppe">
              {butikkNavn(g.butikk)} <span className="dempet">· ca. {kroner.format(g.sum)} kr</span>
            </p>
          )}
          <ul className="hl-liste">
            {g.varer.map(({ i, butikk, p, spart, valg }) => (
              <li key={i.id} className="hl-rad">
                <span className="hl-tekst" style={{ paddingLeft: 2 }}>
                  <b>{i.navn}</b>
                  {i.bruk && <small>{i.bruk}</small>}
                  {p.tilbud && <small className="hl-tilbud">Tilbud hos {butikkNavn(butikk)}</small>}
                  {spart && (
                    <small className={spart.kr > 0 ? "hl-spart" : undefined}>
                      {spart.kr > 0 ? "−" : "+"}
                      {kroner.format(Math.abs(spart.kr))} kr mot {butikkNavn(spart.mot)}
                    </small>
                  )}
                  {valg.length > 1 && <FlyttVelger uke={uke} innkjop={i.id} butikk={butikk} valg={valg} flyttet={Boolean(meny.valg.flytt?.[i.id])} />}
                </span>
                <span className="hl-pris">
                  {p.pris != null ? kr(p.pris) : "–"}
                  {p.pris != null && (p.tilbud || p.anslag) && (
                    <span className={p.tilbud ? "pmerke tilbud" : "pmerke anslag"} title={p.tilbud ? "Tilbud" : "Anslått med Odas pris"}>
                      {p.tilbud ? "%" : "≈"}
                    </span>
                  )}
                </span>
                <form action={settHjemme}>
                  <input type="hidden" name="uke" value={uke} />
                  <input type="hidden" name="innkjop" value={i.id} />
                  <input type="hidden" name="pa" value="1" />
                  <button type="submit" className="liten-pil" aria-label={`Har ${i.navn} hjemme`} title="Har hjemme">
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {innkjop.some((i) => {
        const p = prisHos(i, aktiv.plassering[i.id] ?? valgt[0]!);
        return p.pris != null && (p.tilbud || p.anslag);
      }) && (
        <p className="dempet liten pforklaring">
          <span className="pmerke tilbud">%</span> tilbud · <span className="pmerke anslag">≈</span> anslått med Odas pris, kan være dyrere i butikken
        </p>
      )}
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
        <SendKnapp sendt={Boolean(sendt) && !utdatert} oppdater={utdatert} />
        <p className="dempet liten" style={{ textAlign: "center", margin: 0 }}>
          {utdatert ? (
            <>Menyen er laget på nytt etter at den ble sendt. Trykk for å oppdatere <Link href="/handleliste/liste/mat">Handleliste</Link>. Det du har kjøpt, blir stående.</>
          ) : sendt ? (
            <>
              Sendt til <Link href="/handleliste/liste/mat">Handleliste</Link>. Bytter du rett eller butikk, oppdateres den der også. Det du har kjøpt, blir stående.
            </>
          ) : (
            <>
              Varene legges i <Link href="/handleliste/liste/mat">Handleliste</Link>, med butikk. Bytter du rett etterpå, oppdateres listen der også.
            </>
          )}
        </p>
      </form>
    </Side>
  );
}
