/**
 * Hvilke tilbud passer til oppskriftene i kokeboka. Enkel ordmatching: «400 g kyllingfilet» gir ordet «kyllingfilet»,
 * som treffer «KYLLINGFILET 1 KG». Sammensatte ord treffer på slutten også, så «fløte» treffer «kremfløte».
 */

const MENGDE =
  /^(ca\.?\s*)?[\d.,/½¼¾\s–-]*(g|gram|kg|dl|l|ml|cl|ss|ts|stk|pk|pakke|pakker|boks|bokser|pose|poser|neve|klype|fedd|bunt|beger|glass|skive|skiver|porsjon|porsjoner)?\.?(\s+|$)/i;
const STOPP = new Set(
  "til med og eller av frisk friske fersk ferske hakket hakkede revet revne malt malte tørket tørkede fin fint finhakket grovhakket kokt kokte stekt gjerne ekstra store stor små liten lite naturell uten skinn på for servering pynt etter smak ca evt eventuelt type gode god nykvernet".split(
    " ",
  ),
);

/** «tomater» → «tomat», «poteter» → «potet». */
function stamme(ord: string): string {
  if (ord.length > 5 && ord.endsWith("ene")) return ord.slice(0, -3);
  if (ord.length > 5 && ord.endsWith("er")) return ord.slice(0, -2);
  return ord;
}

const ordI = (tekst: string) => tekst.toLowerCase().split(/[^a-zæøåéü]+/).filter(Boolean);

/** De viktige ordene i en ingredienslinje: uten mengde, enhet og beskrivende ord. */
export function ingrediensord(linje: string): string[] {
  const hoved = linje.replace(/\(.*?\)/g, " ").split(/,(?!\d)| til | med | eller /i)[0]!.trim().replace(MENGDE, "");
  return [...new Set(ordI(hoved).filter((o) => o.length >= 3 && !STOPP.has(o)).map(stamme))];
}

/**
 * Korte ord må treffe nesten helt, så «melk» ikke treffer «kokosmelk» eller «melkestenger».
 * «ris» og «løk» kan stå sist i et sammensatt ord («grøtris», «rødløk»). Lange ord kan stå først eller sist.
 */
function treffer(tilbudOrd: string[], ord: string): boolean {
  return tilbudOrd.some((t) => {
    if (ord.length <= 3) return t === ord || t.endsWith(ord);
    if (ord.length === 4) return t.startsWith(ord) && t.length <= ord.length + 2;
    return t.startsWith(ord) || t.endsWith(ord);
  });
}

export type Treff = { retter: string[]; favoritter: number };

/** Hver oppskrift som tilbudet passer til. Varer vi alltid har hjemme, telles ikke. */
export function lagMatcher(oppskrifter: { navn: string; ingredienser: string[]; favoritt: boolean }[], basisvarer: string[]) {
  const basis = new Set(basisvarer.flatMap(ingrediensord));
  const ord = oppskrifter.map((o) => ({
    navn: o.navn,
    favoritt: o.favoritt,
    ord: [...new Set(o.ingredienser.flatMap(ingrediensord))].filter((w) => !basis.has(w)),
  }));
  return (tilbudNavn: string): Treff => {
    const t = ordI(tilbudNavn);
    const passer = ord.filter((o) => o.ord.some((w) => treffer(t, w)));
    return { retter: passer.map((o) => o.navn), favoritter: passer.filter((o) => o.favoritt).length };
  };
}
