"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { nyListe } from "./actions";

/** Flisen «Ny handleliste»: spør om et navn, og går rett inn i den nye listen. */
export function NyListeKnapp() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="flis flis-krem hl-flis-ny" onClick={() => dialog.current?.showModal()}>
        <b>+ Ny</b>
        <small>Lag en ny handleliste</small>
      </button>
      <dialog ref={dialog} className="hl-dialog" aria-labelledby="ny-liste-tittel">
        <form action={nyListe}>
          <label id="ny-liste-tittel" htmlFor="ny-liste" className="kt">
            Hva skal listen hete?
          </label>
          <input id="ny-liste" name="navn" required maxLength={40} autoComplete="off" autoFocus placeholder="F.eks. Jul, Hytta, Bursdag" className="felt" />
          <div className="knapperad">
            <button type="button" className="lenke" onClick={() => dialog.current?.close()}>
              Avbryt
            </button>
            <LagKnapp />
          </div>
        </form>
      </dialog>
    </>
  );
}

function LagKnapp() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="sekundar" disabled={pending} style={{ margin: 0, width: "auto" }}>
      {pending ? "Lager …" : "Lag liste"}
    </button>
  );
}
