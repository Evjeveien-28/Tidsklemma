"use client";

import { useState } from "react";
import { endreListenavn } from "../../actions";
import type { EgenListe } from "../../data";

/**
 * Tittelen på en handleliste, som Sides tittel. På egne lister kan navnet endres der det står: en liten
 * blyant gjør tittelen om til et felt. Matlisten heter alltid «Mat».
 */
export function ListeTittel({ liste }: { liste: EgenListe | null }) {
  const [endrer, setEndrer] = useState(false);
  const navn = liste?.navn ?? "Mat";
  return (
    <>
      {endrer && liste ? (
        <form action={endreListenavn} className="hl-endre-navn" onSubmit={() => setEndrer(false)}>
          <input type="hidden" name="liste" value={liste.id} />
          <label htmlFor="listenavn" className="visuelt-skjult">
            Navn på listen
          </label>
          <input id="listenavn" name="navn" required maxLength={40} defaultValue={liste.navn} autoFocus autoComplete="off" className="felt" />
          <button type="submit" className="sekundar">
            Lagre
          </button>
          <button type="button" className="lenke" onClick={() => setEndrer(false)}>
            Avbryt
          </button>
        </form>
      ) : (
        <div className="tittelrad">
          <h2 className={navn.length > 12 ? "lang" : undefined}>{navn}</h2>
          {liste && (
            <button type="button" className="hl-blyant" onClick={() => setEndrer(true)} aria-label={`Endre navn på ${liste.navn}`} title="Endre navn">
              ✎
            </button>
          )}
        </div>
      )}
      <div className="strek venstre" />
    </>
  );
}
