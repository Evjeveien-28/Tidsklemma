import { sjekkMeny } from "../../../../middag/agent/sjekk";
import { dagTekst, ukeTekst } from "../../../../middag/uke";
import { sendPush, type Abonnement } from "../../../../push/send";
import { agentDb, nektet } from "../nokkel";

/** Lagrer menyen for en bestilling, og sier fra til husstanden. Feil i menyen kommer tilbake som en liste. */
export async function POST(request: Request) {
  const { nokkel, db } = await agentDb(request);
  const body = (await request.json().catch(() => null)) as { bestilling_id?: unknown; meny?: unknown } | null;
  if (typeof body?.bestilling_id !== "string") return nektet("Send { \"bestilling_id\": …, \"meny\": { … } }");
  const { meny, feil } = sjekkMeny(body.meny);
  if (!meny) return Response.json({ feil: "Menyen har feil. Rett dem og send på nytt.", detaljer: feil }, { status: 400 });

  const { data, error } = await db.rpc("agent_lagre", { nokkel, bid: body.bestilling_id, meny });
  if (error) return nektet(error.message);
  const { uke_start, abonnementer } = data as { uke_start: string; abonnementer: Abonnement[] };

  const forste = meny.dager[0]!;
  await sendPush(abonnementer, {
    tittel: "Ukesmenyen er klar",
    tekst: `${ukeTekst(uke_start).split(",")[0]}: ${forste.alternativer[0]!.navn} på ${dagTekst(forste.dato).split(" ")[0]!.toLowerCase()}${meny.dager.length > 1 ? `, og ${meny.dager.length - 1} middager til` : ""}.`,
    url: `/middag?uke=${uke_start}`,
    merke: "middag",
  });
  return Response.json({ lagret: true, uke_start, dager: meny.dager.length, innkjop: meny.innkjop.length });
}
