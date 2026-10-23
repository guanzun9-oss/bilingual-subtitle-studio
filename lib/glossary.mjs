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
    const match = line.match(/^(.*?)(?:=|＝|→|->)(.*)$/);
    if (!match) continue;
    // Trim after matching: a side that is only whitespace would otherwise
    // reach the API as an empty term and fail every batch.
    const source = match[1].trim();
    const target = match[2].trim();
    if (!source || !target) continue;
    const key = source.toLowerCase();
    if (seen.has(key)) continue;
    if (source.length > MAX_GLOSSARY_TERM_LENGTH || target.length > MAX_GLOSSARY_TERM_LENGTH) continue;
    seen.add(key);
    entries.push([source, target]);
    if (entries.length === MAX_GLOSSARY_ENTRIES) break;
  }
  return entries;
}

/** Whether `term` is written in a script that separates words with spaces. */
function isSpacedScript(term) {
  return /[A-Za-z0-9]/.test(term);
}

function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Words need boundaries ("Ann" is not in "cannot"), allowing plural and
  // possessive endings. Edges that are punctuation ("C++") need none.
  const before = /^[\p{L}\p{N}]/u.test(term) ? "(?<![\\p{L}\\p{N}])" : "";
  const after = /[\p{L}\p{N}]$/u.test(term) ? "(?:'s|’s|s|es)?(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${before}${escaped}${after}`, "iu");
}

/** Only the entries whose source term occurs in `texts`, to keep each request small. */
export function glossaryFor(entries, texts) {
  const haystack = texts.join("\n");
  return entries.filter(([source]) =>
    isSpacedScript(source)
      ? termPattern(source).test(haystack)
      : haystack.toLowerCase().includes(source.toLowerCase()),
  );
}
