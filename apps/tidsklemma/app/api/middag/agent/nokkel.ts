import { createClient } from "@hjem/db/server";

/**
 * Agenten sender nøkkelen i x-agent-key. Den legges på av nettverket i agentens miljø (en «network secret»),
 * så den står aldri i oppgaven eller i repoet. Databasen sjekker den.
 */
export async function agentDb(request: Request) {
  const nokkel = request.headers.get("x-agent-key") ?? "";
  const supabase = await createClient();
  return { nokkel, db: supabase.schema("middag") };
}

export const nektet = (melding: string) => Response.json({ feil: melding }, { status: melding.includes("tilgang") ? 403 : 400 });
