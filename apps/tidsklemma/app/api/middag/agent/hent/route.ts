import { oppgave } from "../../../../middag/agent/oppgave";
import { agentDb, nektet } from "../nokkel";

/** Bestillingene som venter, med alt agenten trenger, og instruksjonene for hvordan menyen lages. */
export async function POST(request: Request) {
  const { nokkel, db } = await agentDb(request);
  const { data, error } = await db.rpc("agent_hent", { nokkel });
  if (error) return nektet(error.message);
  return Response.json({ oppgave: oppgave(new URL(request.url).origin), bestillinger: data });
}
