"use client";

export function SlettKnapp({ navn }: { navn: string }) {
  return (
    <button
      type="submit"
      className="lenke feil"
      onClick={(e) => {
        if (!confirm(`Slette ${navn}?`)) e.preventDefault();
      }}
    >
      Slett oppskrift
    </button>
  );
}
