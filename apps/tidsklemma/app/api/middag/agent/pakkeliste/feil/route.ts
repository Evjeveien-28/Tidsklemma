import { createClient } from "@hjem/db/server";
import { nektet } from "../../nokkel";

/** Agenten fikk ikke laget forslaget. Meldingen vises på turen. */
export async function POST(request: Request) {
  const nokkel = request.headers.get("x-agent-key") ?? "";
  const b = (await request.json().catch(() => null)) as { tur_id?: unknown; melding?: unknown } | null;
  if (typeof b?.tur_id !== "string" || typeof b.melding !== "string") return nektet('Send { "tur_id": …, "melding": "…" }');
  const supabase = await createClient();
  const { error } = await supabase.schema("pakkeliste").rpc("agent_feil", { nokkel, tid: b.tur_id, melding: b.melding });
  if (error) return nektet(error.message);
  return Response.json({ lagret: true });
}
