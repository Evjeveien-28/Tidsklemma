import type { createClient } from "@hjem/db/server";
import { iDag, leggTilDager } from "../dato";
import { valgteRetter, type Meny } from "./meny";
import { dagTekst, mandagI } from "./uke";

type Klient = Awaited<ReturnType<typeof createClient>>;

/**
 * Til Middag-flisen på startsiden: «Menyen lages …» mens agenten jobber, rød prikk og «Ny meny klar»
 * til du har åpnet den, og ellers dagens (eller neste) middag.
 */
export async function middagStatus(supabase: Klient, husstand: string): Promise<{ antall: number; tekst: string } | null> {
  const idag = iDag();
  const denne = mandagI(idag);
  const neste = leggTilDager(denne, 7);
  const db = supabase.schema("middag");
  const [{ data: menyer }, { data: bestillinger }, { data: sett }] = await Promise.all([
    db.from("menyer").select("id, uke_start, data, valg, laget_at").eq("household_id", husstand).in("uke_start", [denne, neste]),
    db.from("bestillinger").select("uke_start, status, created_at").eq("household_id", husstand).in("uke_start", [denne, neste]).in("status", ["venter", "jobber"]),
    db.from("sett").select("meny_id, sett_at"),
  ]);
  const liste = (menyer ?? []) as Meny[];

  const lages = (bestillinger ?? []).some((b) => {
    const m = liste.find((x) => x.uke_start === b.uke_start);
    return !m || b.created_at > m.laget_at;
  });
  if (lages) return { antall: 0, tekst: "Ukesplanen lages …" };

  const usett = liste
    .filter((m) => !(sett ?? []).some((s) => s.meny_id === m.id && s.sett_at >= m.laget_at))
    .sort((a, b) => a.uke_start.localeCompare(b.uke_start));
  if (usett.length) return { antall: 1, tekst: usett[0]!.uke_start === neste && usett.length === 1 ? "Ny meny klar for neste uke" : "Ny meny klar" };

  // Dagens middag, eller den neste i menyene vi har.
  const retter = liste
    .sort((a, b) => a.uke_start.localeCompare(b.uke_start))
    .flatMap((m) => valgteRetter(m))
    .filter((r) => r.dag.dato >= idag && r.type !== "fri");
  const kommende = retter[0];
  if (!kommende) return null;
  let navn = kommende.type === "alternativ" ? kommende.alt.navn : null;
  if (!navn && kommende.type === "egen") {
    const { data } = await db.from("oppskrifter").select("navn").eq("id", kommende.oppskrift_id).maybeSingle();
    navn = data?.navn ?? "Egen rett";
  }
  const dag = kommende.dag.dato === idag ? "I dag" : kommende.dag.dato === leggTilDager(idag, 1) ? "I morgen" : dagTekst(kommende.dag.dato).split(" ")[0];
  return { antall: 0, tekst: `${dag}: ${navn}` };
}

/** Merk menyen som sett av den som er logget inn. */
export async function merkSett(supabase: Klient, menyId: string) {
  await supabase.schema("middag").from("sett").upsert({ meny_id: menyId, sett_at: new Date().toISOString() }, { onConflict: "meny_id,user_id" });
}
