import { Logo } from "../logo";
import { Innlogging } from "./innlogging";
import { Kode } from "./kode";

export default async function LoggInn({
  searchParams,
}: {
  searchParams: Promise<{ sendt?: string; feil?: string; kode?: string; epost?: string }>;
}) {
  const { sendt, feil, kode, epost } = await searchParams;

  return (
    <main className="ramme innlogging">
      <Logo storrelse={150} className="logo stor" />
      <h1>Tidsklemma</h1>
      <div className="strek" />
      <p className="undertekst">Hjemme-appen</p>
      {kode && epost ? (
        <Kode epost={epost} feil={feil} />
      ) : sendt ? (
        <div className="bunnknapper">
          <div className="kort">
            <p className="kt">Sjekk e-posten din</p>
            <p>Trykk på lenken i e-posten for å logge inn. Den kan havne i søppelpost.</p>
          </div>
        </div>
      ) : (
        <Innlogging epostFeil={Boolean(feil)} />
      )}
    </main>
  );
}
