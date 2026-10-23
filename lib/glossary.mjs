/**
 * A per-film list of names and terms with their fixed translations, so every
 * batch translates them the same way.
 */

export const MAX_GLOSSARY_ENTRIES = 100;
export const MAX_GLOSSARY_TERM_LENGTH = 100;

/**
 * Parse lines such as "Zane = 赞恩" or "Kubernetes → Kubernetes" into
 * `[source, target]` pairs. Blank, malformed, overlong, and repeated source
 * terms are skipped.
 */
export function parseGlossary(text) {
  const entries = [];
  const seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(.+?)\s*(?:=|＝|→|->)\s*(.+?)\s*$/);
    if (!match) continue;
    const [, source, target] = match;
    const key = source.toLowerCase();
    if (seen.has(key)) continue;
    if (source.length > MAX_GLOSSARY_TERM_LENGTH || target.length > MAX_GLOSSARY_TERM_LENGTH) continue;
    seen.add(key);
    entries.push([source, target]);
    if (entries.length === MAX_GLOSSARY_ENTRIES) break;
  }
  return entries;
}

/** Only the entries whose source term occurs in `texts`, to keep each request small. */
export function glossaryFor(entries, texts) {
  const haystack = texts.join("\n").toLowerCase();
  return entries.filter(([source]) => haystack.includes(source.toLowerCase()));
}
