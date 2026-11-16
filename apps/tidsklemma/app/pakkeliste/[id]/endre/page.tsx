import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { hentPersoner } from "../../../husstand/personer";
import { Side } from "../../../side";
import { endreTur, slettTur } from "../../actions";
import { hentTur } from "../../data";
import { TurSkjema } from "../../tur-skjema";
import { SlettTurKnapp } from "./slett-knapp";
import { agentKlar } from "../../../middag/agent/start";

export default async function EndreTur({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const tur = await hentTur(supabase, id);
  if (!tur) notFound();
  const personer = await hentPersoner(supabase, tur.household_id);
  return (
    <Side tittel="Endre tur" tilbake={{ href: `/pakkeliste/${id}`, navn: tur.tittel }}>
      <TurSkjema tur={tur} personer={personer} handling={endreTur} knapp="Lagre" nyRunde={agentKlar() && !tur.laast_at} />
      <form action={slettTur} style={{ marginTop: 24, textAlign: "center" }}>
        <input type="hidden" name="tur" value={tur.id} />
        <SlettTurKnapp navn={tur.tittel} />
      </form>
    </Side>
  );
}
