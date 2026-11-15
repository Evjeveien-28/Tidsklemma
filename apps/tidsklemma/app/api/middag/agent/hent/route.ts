import { oppgave } from "../../../../middag/agent/oppgave";
import { hentTilbud } from "../../../../middag/tilbud-hent";
import { agentDb, nektet } from "../nokkel";

export const maxDuration = 60;

/** Tilbud eldre enn dette hentes på nytt før menyen lages. Kundeavisene for neste uke kommer på søndag. */
const FERSKE_TIMER = 3;

/** Bestillingene som venter, med alt agenten trenger, og instruksjonene for hvordan menyen lages. */
export async function POST(request: Request) {
  const { nokkel, db } = await agentDb(request);

  // Ferske tilbud først, så søndagsmenyen får med tilbudene som starter mandag.
  const { data: grunnlag } = await db.rpc("tilbud_grunnlag", { hemmelig: nokkel });
  for (const h of (grunnlag ?? []) as { household_id: string; butikker: string[]; lat: number; lng: number; hentet: string | null }[]) {
    if (h.hentet && Date.now() - Date.parse(h.hentet) < FERSKE_TIMER * 3_600_000) continue;
    const tilbud = await hentTilbud(h.butikker, h.lat, h.lng);
    // Tomt svar betyr som regel at noe gikk galt hos Tjek. Da beholder vi de gamle.
    if (tilbud.length) await db.rpc("lagre_tilbud", { hemmelig: nokkel, hid: h.household_id, nye: tilbud });
  }

  const { data, error } = await db.rpc("agent_hent", { nokkel });
  if (error) return nektet(error.message);
  return Response.json({ oppgave: oppgave(new URL(request.url).origin), bestillinger: data });
}
