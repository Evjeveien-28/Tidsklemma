/**
 * «2 brød», «brød x2», «3 stk løk» → antall og navn. Tekst med komma eller linjeskift blir flere varer.
 * Uten tall først blir antallet 1, så «400 g kjøttdeig» er én vare som heter det.
 */
export function lesVarer(tekst: string): { navn: string; antall: number; tekst: string }[] {
  return tekst
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 30)
    .map((t) => ({ t, ...tolk(t) }))
    .map((v) => ({ navn: v.navn.slice(0, 120), antall: Math.min(Math.max(v.antall, 1), 999), tekst: v.t.slice(0, 120) }));
}

function tolk(t: string): { navn: string; antall: number } {
  let m = t.match(/^(\d{1,3})\s*(?:x|stk\.?|pk\.?)?\s+(.+)$/i);
  // «400 g kjøttdeig» og «2 l melk» er mengden, ikke antallet.
  if (m && !/^(g|kg|l|dl|ml|cl)(\s|$)/i.test(m[2]!)) return { antall: Number(m[1]), navn: m[2]! };
  m = t.match(/^(.+?)\s*x\s*(\d{1,3})$/i);
  if (m) return { antall: Number(m[2]), navn: m[1]! };
  return { antall: 1, navn: t };
}
