import { NG_KJEDER, sokNorgesgruppen } from "../../../../middag/norgesgruppen";
import { agentDb, nektet } from "../nokkel";

export const maxDuration = 60;

/**
 * Vanlige hyllepriser i kjedene som har nettbutikk med priser (Meny, Spar, Joker), for en liste med søk.
 * Send { "sok": ["kyllingfilet 1 kg", …], "butikker": ["MENY_NO", …] }. Butikker uten nettpriser hoppes over.
 */
export async function POST(request: Request) {
  const { nokkel, db } = await agentDb(request);
  const { data: ok } = await db.rpc("agent_nokkel_ok", { nokkel });
  if (ok !== true) return nektet("Ikke tilgang");
  const body = (await request.json().catch(() => null)) as { sok?: unknown; butikker?: unknown } | null;
  const sok = Array.isArray(body?.sok) ? body.sok.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 60) : [];
  const butikker = (Array.isArray(body?.butikker) ? body.butikker : []).filter((b): b is string => typeof b === "string" && b in NG_KJEDER);
  if (sok.length === 0) return nektet('Send { "sok": ["kyllingfilet", …], "butikker": ["MENY_NO", …] }');
  if (butikker.length === 0) return Response.json({ resultater: [], merknad: `Ingen av butikkene har nettpriser. Bare ${Object.keys(NG_KJEDER).join(", ")} støttes.` });

  const svar: { sok: string; butikker: Record<string, unknown[]> }[] = sok.map((s) => ({ sok: s, butikker: {} }));
  for (const butikk of butikker) {
    // Litt om gangen, så vi ikke hamrer på nettbutikken.
    for (let i = 0; i < sok.length; i += 6) {
      const del = sok.slice(i, i + 6);
      const treff = await Promise.all(del.map((s) => sokNorgesgruppen(butikk, s, 4)));
      del.forEach((_, n) => (svar[i + n]!.butikker[butikk] = treff[n]!));
    }
  }
  return Response.json({ resultater: svar });
}
