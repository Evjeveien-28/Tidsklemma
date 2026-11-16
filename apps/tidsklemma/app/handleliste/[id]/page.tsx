import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { Bilde } from "../../middag/bilde";
import { BUTIKKER, butikkNavn } from "../../middag/butikker";
import { Side } from "../../side";
import { lagreVare, slettVare, velgProdukt } from "../actions";
import { egneButikker, kr, VAREFELT, type Vare } from "../data";
import { sokOda } from "../oda";

export default async function VareSide({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feil?: string }> }) {
  const [{ id }, { feil }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.schema("handleliste").from("varer").select(`${VAREFELT}, household_id`).eq("id", id).maybeSingle();
  if (!data) notFound();
  const v = data as Vare & { household_id: string };
  const [forslag, { data: inn }] = await Promise.all([
    sokOda(v.navn, 8),
    supabase.schema("middag").from("innstillinger").select("butikker").eq("household_id", v.household_id).maybeSingle(),
  ]);
  const vare = forslag.some((p) => p.id === v.produkt?.id) || !v.produkt ? forslag : [v.produkt, ...forslag];
  const valgbare = (inn?.butikker as string[] | undefined)?.length ? BUTIKKER.filter((b) => (inn!.butikker as string[]).includes(b.kode)) : BUTIKKER;
  // Butikken varen står på, selv om den er skrevet inn som fritekst (f.eks. «Clas Ohlson») eller ikke er i listen over.
  const egne = egneButikker([v], new Set(valgbare.map((b) => b.kode)));

  return (
    <Side tittel={v.navn} tilbake={{ href: "/handleliste", navn: "Handleliste" }}>
      <form action={lagreVare}>
        <input type="hidden" name="vare" value={v.id} />
        <div className="to-felt">
          <label>
            <span className="kt">Vare</span>
            <input name="navn" required maxLength={120} defaultValue={v.navn} className="felt" />
          </label>
          <label>
            <span className="kt">Antall</span>
            <input name="antall" type="number" inputMode="decimal" min={0.01} max={999} step="any" defaultValue={v.antall} className="felt" />
          </label>
        </div>
        <label htmlFor="butikk" className="kt">
          Butikk <span className="valgfritt">(valgfritt)</span>
        </label>
        <select id="butikk" name="butikk" defaultValue={v.butikk ?? ""} className="felt">
          <option value="">Hvor som helst</option>
          {valgbare.map((b) => (
            <option key={b.kode} value={b.kode}>
              {b.navn}
              {(() => {
                const p = v.produkt?.middag?.priser[b.kode];
                if (!p) return null;
                return p.pris != null ? ` · ${kr(p.pris)} kr${p.tilbud ? " (tilbud)" : p.anslag ? " (anslag)" : ""}` : " · ingen pris";
              })()}
            </option>
          ))}
          {egne.map((n) => (
            <option key={n} value={n}>
              {butikkNavn(n)}
            </option>
          ))}
        </select>
        {feil === "navn" && <p className="feil">Varen må ha et navn.</p>}
        <button type="submit" className="sekundar" style={{ width: "100%" }}>
          Lagre
        </button>
      </form>

      <section className="kort" style={{ marginTop: 20 }}>
        <p className="kt">Pris anslått fra</p>
        <form action={velgProdukt}>
          <input type="hidden" name="vare" value={v.id} />
          <ul className="hl-valg">
            {vare.map((p) => (
              <li key={p.id}>
                <label>
                  <input type="radio" name="produkt" value={JSON.stringify(p)} defaultChecked={!v.uten_pris && v.produkt?.id === p.id} />
                  <span className="tbilde">
                    <Bilde src={p.bilde} />
                  </span>
                  <span className="pt">
                    <b>{p.navn}</b>
                    <small>
                      {[p.ekstra, p.kilopris && p.enhet && `${kr(p.kilopris)}/${p.enhet}`, p.tilbud && `Oda: ${p.tilbud}`].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <span className="hl-pris">{kr(p.pris)}</span>
                </label>
              </li>
            ))}
            <li>
              <label>
                <input type="radio" name="produkt" value="ingen" defaultChecked={v.uten_pris} />
                <span className="pt">
                  <b>Ingen pris</b>
                  <small>F.eks. for ting som ikke selges hos Oda</small>
                </span>
              </label>
            </li>
          </ul>
          {vare.length === 0 && <p className="dempet">Fant ingen treff hos Oda for «{v.navn}». Prøv å endre navnet på varen.</p>}
          <button type="submit" className="sekundar" style={{ width: "100%" }}>
            Bruk valgt vare
          </button>
        </form>
      </section>

      <form action={slettVare} className="bunnknapper">
        <input type="hidden" name="vare" value={v.id} />
        <button type="submit" className="lenke feil">
          Fjern fra listen
        </button>
      </form>
    </Side>
  );
}
