"use client";

import { useRef, useState } from "react";
import { endreButikker, sorterButikker } from "./actions";
import { butikkNavn } from "./butikker";

/**
 * Butikkene i prioritert rekkefølge. Hold i håndtaket og dra for å flytte, også med finger på mobil.
 * Med tastatur: piltast opp/ned på håndtaket.
 */
export function ButikkRekkefolge({ butikker }: { butikker: string[] }) {
  const [liste, setListe] = useState(butikker);
  const [drar, setDrar] = useState<string | null>(null);
  const [lagrer, setLagrer] = useState(false);
  const ol = useRef<HTMLOListElement>(null);
  const start = useRef(butikker);

  async function lagre(ny: string[]) {
    if (ny.join() === start.current.join()) return;
    setLagrer(true);
    const ok = await sorterButikker(ny);
    if (ok) start.current = ny;
    else setListe(start.current);
    setLagrer(false);
  }

  function flyttTil(kode: string, y: number) {
    const rader = [...(ol.current?.children ?? [])] as HTMLElement[];
    // Ny plass: antall andre rader som har midten over fingeren.
    const andre = rader.filter((r) => r.dataset.kode !== kode);
    const plass = andre.filter((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2 < y;
    }).length;
    setListe((l) => {
      const uten = l.filter((k) => k !== kode);
      const ny = [...uten.slice(0, plass), kode, ...uten.slice(plass)];
      return ny.join() === l.join() ? l : ny;
    });
  }

  function tast(e: React.KeyboardEvent, kode: string) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const i = liste.indexOf(kode);
    const j = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (j < 0 || j >= liste.length) return;
    const ny = [...liste];
    [ny[i], ny[j]] = [ny[j]!, ny[i]!];
    setListe(ny);
    void lagre(ny);
  }

  return (
    <ol className="butikkliste" ref={ol} aria-busy={lagrer}>
      {liste.map((kode, i) => (
        <li key={kode} data-kode={kode} className={drar === kode ? "drar" : undefined}>
          <span className="butikk-nr">{i + 1}</span>
          <b>{butikkNavn(kode)}</b>
          <span className="butikk-knapper">
            {liste.length > 1 && (
              <form action={endreButikker}>
                <input type="hidden" name="kode" value={kode} />
                <input type="hidden" name="hva" value="fjern" />
                <button type="submit" className="liten-pil" aria-label={`Fjern ${butikkNavn(kode)}`}>
                  ✕
                </button>
              </form>
            )}
            {liste.length > 1 && (
              <button
                type="button"
                className="handtak"
                aria-label={`Flytt ${butikkNavn(kode)}, nummer ${i + 1}. Bruk piltastene.`}
                onKeyDown={(e) => tast(e, kode)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrar(kode);
                }}
                onPointerMove={(e) => drar === kode && flyttTil(kode, e.clientY)}
                onPointerUp={() => {
                  setDrar(null);
                  void lagre(liste);
                }}
                onPointerCancel={() => setDrar(null)}
              >
                ⠿
              </button>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
