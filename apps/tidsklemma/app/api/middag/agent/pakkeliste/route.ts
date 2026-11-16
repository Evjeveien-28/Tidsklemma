import { createClient } from "@hjem/db/server";
import { nektet } from "../nokkel";

/** Agentens forslag til en pakkeliste. Nye ting legges til listen. Det som allerede står der, hoppes over. */
export async function POST(request: Request) {
  const nokkel = request.headers.get("x-agent-key") ?? "";
  const b = (await request.json().catch(() => null)) as { tur_id?: unknown; ting?: unknown; merknad?: unknown; fjern?: unknown } | null;
  if (typeof b?.tur_id !== "string" || !Array.isArray(b.ting))
    return nektet('Send { "tur_id": …, "ting": [{ "person_id": … | null, "navn": "…", "antall": 1 }], "merknad": "…" }');
  const feil: string[] = [];
  const ting = b.ting.slice(0, 250).flatMap((t: Record<string, unknown>, n) => {
    if (typeof t?.navn !== "string" || !t.navn.trim()) return feil.push(`ting[${n}].navn mangler`), [];
    if (t.person_id != null && (typeof t.person_id !== "string" || !/^[0-9a-f-]{36}$/.test(t.person_id))) return feil.push(`ting[${n}].person_id må være en id eller null`), [];
    return [{ person_id: t.person_id ?? null, navn: t.navn.trim().slice(0, 120), antall: typeof t.antall === "number" ? Math.round(t.antall) : 1 }];
  });
  if (feil.length) return Response.json({ feil: "Forslaget har feil. Rett dem og send på nytt.", detaljer: feil.slice(0, 20) }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.schema("pakkeliste").rpc("agent_lagre", {
    nokkel,
    tid: b.tur_id,
    ting,
    merknad: typeof b.merknad === "string" ? b.merknad : "",
    // Agentens egne forslag som ikke passer lenger. Databasen fjerner bare det agenten har foreslått, og ikke det som er pakket.
    fjern: Array.isArray(b.fjern) ? b.fjern.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)).slice(0, 250) : [],
  });
  if (error) return nektet(error.message);
  return Response.json({ lagret: true, lagt_til: data });
}
