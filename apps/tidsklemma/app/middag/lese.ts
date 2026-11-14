/** «Middag, rask; vegetar» → ["middag", "rask", "vegetar"]. */
export function lesMerkelapper(tekst: string): string[] {
  return [...new Set(tekst.split(/[,;]/).map((m) => m.trim().toLowerCase()).filter(Boolean))].slice(0, 12).map((m) => m.slice(0, 30));
}
