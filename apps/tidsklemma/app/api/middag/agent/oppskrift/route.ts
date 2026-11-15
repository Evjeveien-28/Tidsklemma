import { agentDb, nektet } from "../nokkel";

/** Agenten har lest en oppskrift fra teksten på siden. Lagres bare hvis oppskriften fortsatt mangler ingredienser. */
export async function POST(request: Request) {
  const { nokkel, db } = await agentDb(request);
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof b?.id !== "string" || !/^[0-9a-f-]{36}$/.test(b.id) || !Array.isArray(b.ingredienser))
    return nektet('Send { "id": …, "ingredienser": ["400 g kjøttdeig", …], "minutter"?, "porsjoner"?, "fremgangsmaate"? }');
  const ingredienser = b.ingredienser
    .filter((l): l is string => typeof l === "string" && !!l.trim())
    .map((l) => l.trim().slice(0, 200))
    .slice(0, 100);
  const heltall = (v: unknown, min: number, maks: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= maks ? Math.round(v) : null);
  const { data, error } = await db.rpc("agent_fyll_oppskrift", {
    nokkel,
    oid: b.id,
    ingredienser,
    minutter: heltall(b.minutter, 1, 1440),
    porsjoner: heltall(b.porsjoner, 1, 100),
    fremgangsmaate: typeof b.fremgangsmaate === "string" ? b.fremgangsmaate.slice(0, 20000) : null,
  });
  if (error) return nektet(error.message);
  return Response.json({ lagret: data === true, ingredienser: ingredienser.length });
}
