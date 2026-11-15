/**
 * Starter agenten (en planlagt oppgave på claude.ai) med en gang noen bestiller en meny.
 * Adressen og tokenet settes i Vercel. Uten dem venter bestillingen til neste faste kjøring.
 */
export function agentKlar() {
  return Boolean(process.env.MIDDAG_AGENT_URL && process.env.MIDDAG_AGENT_TOKEN);
}

export async function startAgent(): Promise<boolean> {
  if (!agentKlar()) return false;
  try {
    const svar = await fetch(process.env.MIDDAG_AGENT_URL!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MIDDAG_AGENT_TOKEN}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    if (!svar.ok) console.error("Klarte ikke å starte middagsagenten:", svar.status, await svar.text().catch(() => ""));
    return svar.ok;
  } catch (e) {
    console.error("Klarte ikke å starte middagsagenten:", e);
    return false;
  }
}
