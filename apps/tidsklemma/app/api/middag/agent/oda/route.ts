import { sokOda } from "../../../../handleliste/oda";
import { agentDb, nektet } from "../nokkel";

export const maxDuration = 60;

/** Vanlige priser fra Oda for en liste med søk, f.eks. ["kyllingfilet", "kokosmelk"]. */
export async function POST(request: Request) {
  const { nokkel, db } = await agentDb(request);
  const { data: ok } = await db.rpc("agent_nokkel_ok", { nokkel });
  if (ok !== true) return nektet("Ikke tilgang");
  const body = (await request.json().catch(() => null)) as { sok?: unknown } | null;
  const sok = Array.isArray(body?.sok) ? body.sok.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 60) : [];
  if (sok.length === 0) return nektet("Send { \"sok\": [\"kyllingfilet\", …] }");
  const svar: { sok: string; treff: unknown[] }[] = [];
  // Litt om gangen, så vi ikke hamrer på Oda.
  for (let i = 0; i < sok.length; i += 6) {
    const del = sok.slice(i, i + 6);
    const treff = await Promise.all(del.map((s) => sokOda(s, 4)));
    del.forEach((s, n) =>
      svar.push({ sok: s, treff: treff[n]!.map((p) => ({ navn: [p.navn, p.ekstra].filter(Boolean).join(", "), pris: p.pris, kilopris: p.kilopris, enhet: p.enhet, tilbud: p.tilbud })) }),
    );
  }
  return Response.json({ resultater: svar });
}
