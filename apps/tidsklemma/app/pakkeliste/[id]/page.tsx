import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../../husstand/personer";
import { Side } from "../../side";
import { lasTur, leggTil, nullstillPakket } from "../actions";
import { hentTing, hentTur, netter, periode } from "../data";
import { PakkListe, type Gruppe } from "../liste";

export default async function TurSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const tur = await hentTur(supabase, id);
  if (!tur) notFound();
  const [personer, ting] = await Promise.all([hentPersoner(supabase, tur.household_id), hentTing(supabase, id)]);
  const med = personer.filter((p) => tur.personer.includes(p.id));
  const laast = Boolean(tur.laast_at);

  // En gruppe per person som er med, felles til slutt. Ting til noen som ikke lenger er med, havner på felles.
  const rad = (t: (typeof ting)[number]) => ({ id: t.id, navn: t.navn, antall: t.antall, pakket: Boolean(t.pakket_at), agent: t.kilde === "agent" });
  const grupper: Gruppe[] = [
    ...med.map((p) => ({ id: p.id, navn: p.navn, farge: p.farge, rader: ting.filter((t) => t.person_id === p.id).map(rad) })),
    { id: "felles", navn: "Felles", farge: null, rader: ting.filter((t) => !t.person_id || !tur.personer.includes(t.person_id)).map(rad) },
  ];
  const pakket = ting.filter((t) => t.pakket_at).length;
  const endre = (
    <Link href={`/pakkeliste/${id}/endre`} className="inline-knapp" style={{ minHeight: 0 }}>
      Endre
    </Link>
  );

  return (
    <Side tittel={tur.tittel} tilbake={{ href: "/pakkeliste", navn: "Pakkeliste" }} handling={endre}>
      <p className="dempet" style={{ marginTop: 0 }}>
        {[periode(tur.fra, tur.til), netter(tur.fra, tur.til), tur.sted, laast && "Låst"].filter(Boolean).join(" · ")}
      </p>
      {tur.beskrivelse && <p className="pk-beskrivelse">{tur.beskrivelse}</p>}
      {ting.length > 0 && (
        <div className="pk-fremdrift" role="progressbar" aria-valuemin={0} aria-valuemax={ting.length} aria-valuenow={pakket} aria-label="Pakket">
          <span style={{ width: `${Math.round((pakket / ting.length) * 100)}%` }} />
          <small>
            {pakket} av {ting.length} pakket
          </small>
        </div>
      )}

      <PakkListe tur={id} grupper={grupper} laast={laast} />

      <form action={leggTil} className="kort pk-legg-til">
        <input type="hidden" name="tur" value={id} />
        <label htmlFor="navn" className="kt">
          Legg til
        </label>
        <input id="navn" name="navn" required maxLength={2000} placeholder="F.eks. ullundertøy, 3 sokker" autoComplete="off" className="felt" />
        <div className="knapperad">
          <select name="person" defaultValue={med[0]?.id ?? ""} className="felt" aria-label="Til hvem" style={{ margin: 0, flex: 1 }}>
            {med.map((p) => (
              <option key={p.id} value={p.id}>
                {p.navn}
              </option>
            ))}
            <option value="">Felles</option>
          </select>
          <button type="submit" className="sekundar">
            Legg til
          </button>
        </div>
      </form>

      <div className="kort pk-laas">
        {laast ? (
          <>
            <p className="kt">Pakkelisten er låst</p>
            <p className="dempet liten">Den blir husket til neste gang dere skal på en lignende tur. Lås opp for å fjerne ting.</p>
          </>
        ) : (
          <>
            <p className="kt">Er listen slik dere vil ha den?</p>
            <p className="dempet liten">Lås den, gjerne etter turen, så blir den husket til neste gang dere skal på en lignende tur.</p>
          </>
        )}
        <form action={lasTur}>
          <input type="hidden" name="tur" value={id} />
          <input type="hidden" name="pa" value={laast ? "0" : "1"} />
          <button type="submit" className={laast ? "inline-knapp" : "sekundar"}>
            {laast ? "Lås opp" : "Lås pakkelisten"}
          </button>
        </form>
      </div>

      {pakket > 0 && (
        <form action={nullstillPakket} style={{ textAlign: "center", marginTop: 8 }}>
          <input type="hidden" name="tur" value={id} />
          <button type="submit" className="lenke">
            Fjern alle kryss (f.eks. før hjemreisen)
          </button>
        </form>
      )}
    </Side>
  );
}
