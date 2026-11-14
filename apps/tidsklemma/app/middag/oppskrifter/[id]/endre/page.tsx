import { notFound } from "next/navigation";
import { createClient } from "@hjem/db/server";
import { Side } from "../../../../side";
import { OPPSKRIFTFELT, type Oppskrift } from "../../../data";
import { OppskriftSkjema } from "../../../oppskrift-skjema";

export default async function EndreOppskrift({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feil?: string }> }) {
  const [{ id }, { feil }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.schema("middag").from("oppskrifter").select(OPPSKRIFTFELT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as Oppskrift;
  return (
    <Side tittel="Endre" tilbake={{ href: `/middag/oppskrifter/${o.id}`, navn: o.navn }}>
      {feil && <p className="feil">{feil === "navn" ? "Oppskriften må ha et navn." : "Det gikk ikke å lagre. Prøv igjen."}</p>}
      <OppskriftSkjema o={o} />
    </Side>
  );
}
