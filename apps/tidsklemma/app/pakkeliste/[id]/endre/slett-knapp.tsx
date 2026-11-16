"use client";

export function SlettTurKnapp({ navn }: { navn: string }) {
  return (
    <button
      type="submit"
      className="lenke feil"
      onClick={(e) => {
        if (!confirm(`Slette ${navn} og pakkelisten?`)) e.preventDefault();
      }}
    >
      Slett turen
    </button>
  );
}
