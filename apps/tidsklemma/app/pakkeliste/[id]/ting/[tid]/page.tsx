import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../../../../husstand/personer";
import { Side } from "../../../../side";
import { endreTing } from "../../../actions";
import { hentTur, type Ting } from "../../../data";

export default async function EndreTing({ params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(tid)) notFound();
  const supabase = await createClient();
  const [tur, { data }] = await Promise.all([
    hentTur(supabase, id),
    supabase.schema("pakkeliste").from("ting").select("id, tur_id, person_id, navn, antall").eq("id", tid).eq("tur_id", id).maybeSingle(),
  ]);
  if (!tur || !data) notFound();
  const ting = data as Pick<Ting, "id" | "tur_id" | "person_id" | "navn" | "antall">;
  const med = (await hentPersoner(supabase, tur.household_id)).filter((p) => tur.personer.includes(p.id));

  return (
    <Side tittel="Endre" tilbake={{ href: `/pakkeliste/${id}`, navn: tur.tittel }}>
      <form action={endreTing}>
        <input type="hidden" name="ting" value={ting.id} />
        <input type="hidden" name="tur" value={id} />
        <label htmlFor="navn" className="kt">
          Hva
        </label>
        <input id="navn" name="navn" required maxLength={120} defaultValue={ting.navn} className="felt" />
        <div className="to-felt">
          <label>
            <span className="kt">Antall</span>
            <input name="antall" type="number" inputMode="numeric" min={1} max={99} defaultValue={ting.antall} className="felt" />
          </label>
          <label>
            <span className="kt">Til</span>
            <select name="person" defaultValue={ting.person_id && tur.personer.includes(ting.person_id) ? ting.person_id : ""} className="felt">
              {med.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.navn}
                </option>
              ))}
              <option value="">Felles</option>
            </select>
          </label>
        </div>
        <button type="submit" className="primar" style={{ marginTop: 12 }}>
          Lagre
        </button>
      </form>
    </Side>
  );
}
