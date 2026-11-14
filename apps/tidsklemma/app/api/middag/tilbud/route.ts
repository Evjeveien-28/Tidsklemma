import { createClient } from "@hjem/db/server";
import { hentTilbud } from "../../../middag/tilbud-hent";

export const maxDuration = 60;

/** Kalles hver natt av en jobb i Supabase (pg_cron), med samme hemmelighet som de andre jobbene. */
export async function POST(request: Request) {
  const hemmelig = request.headers.get("x-hemmelighet") ?? "";
  const supabase = await createClient();
  const db = supabase.schema("middag");
  const { data, error } = await db.rpc("tilbud_grunnlag", { hemmelig });
  if (error) return Response.json({ feil: error.message }, { status: 403 });

  const husstander = data as { household_id: string; butikker: string[]; lat: number; lng: number }[];
  const antall: Record<string, number> = {};
  for (const h of husstander) {
    const tilbud = await hentTilbud(h.butikker, h.lat, h.lng);
    // Tomt svar betyr som regel at noe gikk galt hos Tjek. Da beholder vi gårsdagens.
    if (tilbud.length === 0) continue;
    const { error: feil } = await db.rpc("lagre_tilbud", { hemmelig, hid: h.household_id, nye: tilbud });
    antall[h.household_id] = feil ? -1 : tilbud.length;
  }
  return Response.json({ husstander: husstander.length, antall });
}
