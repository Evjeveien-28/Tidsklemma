import { agentDb, nektet } from "../nokkel";

/** Agenten fikk ikke laget menyen. Meldingen vises på Middag-siden. */
export async function POST(request: Request) {
  const { nokkel, db } = await agentDb(request);
  const body = (await request.json().catch(() => null)) as { bestilling_id?: unknown; melding?: unknown } | null;
  if (typeof body?.bestilling_id !== "string" || typeof body.melding !== "string") return nektet("Send { \"bestilling_id\": …, \"melding\": \"…\" }");
  const { error } = await db.rpc("agent_feil", { nokkel, bid: body.bestilling_id, melding: body.melding });
  if (error) return nektet(error.message);
  return Response.json({ lagret: true });
}
