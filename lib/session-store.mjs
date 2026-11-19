/**
 * Saves subtitle work in the browser so a refresh or crash does not lose
 * paid translations. Nothing here reaches the server. `storage` is any
 * localStorage-like object, which keeps the rules testable outside a browser.
 */

const PREFIX = "subtitle-studio:";
const INDEX_KEY = `${PREFIX}sessions`;
const PREFS_KEY = `${PREFIX}prefs`;
const API_KEY_KEY = `${PREFIX}api-key`;

/** DeepSeek keeps the original storage key so keys saved before other providers still load. */
function apiKeyKey(provider = "deepseek") {
  return provider === "deepseek" ? API_KEY_KEY : `${API_KEY_KEY}:${provider}`;
}
export const MAX_SESSIONS = 3;

/** FNV-1a of the source text plus its length: the same file maps to the same session. */
export function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}-${text.length}`;
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded, private browsing, or storage disabled.
    return false;
  }
}

function remove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

/** Saved sessions, newest first: `{ id, name, savedAt, translated, hasSource }`. */
export function listSessions(storage) {
  const index = readJson(storage, INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

function isTranslationMap(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every((text) => typeof text === "string");
}

/**
 * The saved session, or null when missing or malformed (e.g. hand-edited or
 * from an older version). `translations` belongs to `sourceLanguage` →
 * `target` (English → Simplified Chinese for sessions saved before other
 * languages existed); `byTarget`, when present, holds the work for the other
 * language pairs, keyed "source>target".
 */
export function loadSession(storage, id) {
  const session = readJson(storage, `${PREFIX}session:${id}`);
  if (!session || !isTranslationMap(session.translations)) return null;
  if (session.sourceText !== undefined && typeof session.sourceText !== "string") return null;
  if (session.glossary !== undefined && typeof session.glossary !== "string") return null;
  for (const key of ["target", "sourceLanguage"]) {
    if (session[key] !== undefined && typeof session[key] !== "string") return null;
  }
  if (session.byTarget !== undefined &&
    (!session.byTarget || typeof session.byTarget !== "object" || Array.isArray(session.byTarget) ||
      !Object.values(session.byTarget).every(isTranslationMap))) {
    return null;
  }
  return session;
}

export function removeSession(storage, id) {
  remove(storage, `${PREFIX}session:${id}`);
  writeJson(storage, INDEX_KEY, listSessions(storage).filter((entry) => entry.id !== id));
}

/**
 * Save `{ id, name, sourceText, translations, glossary, target, sourceLanguage,
 * byTarget }`; only the first four are required. When storage is full, older
 * sessions are dropped first; if the source text itself does not fit, only
 * the translations are kept and the user re-selects the file to continue.
 * Returns "saved", "saved-without-source", or "failed".
 */
export function saveSession(
  storage,
  { id, name, sourceText, translations, glossary, target, sourceLanguage, byTarget },
  now = Date.now(),
) {
  if (!storage) return "failed";
  const key = `${PREFIX}session:${id}`;
  const translated = Object.values(translations).filter((text) => String(text).trim()).length;
  let others = listSessions(storage).filter((entry) => entry.id !== id);

  const attempt = (withSource) => {
    const record = { id, name, savedAt: now, translations };
    if (glossary) record.glossary = glossary;
    if (target) record.target = target;
    if (sourceLanguage) record.sourceLanguage = sourceLanguage;
    // Other language pairs' work is only worth storing when there is some.
    if (byTarget && Object.values(byTarget).some((pair) => Object.keys(pair).length)) {
      record.byTarget = byTarget;
    }
    if (withSource) record.sourceText = sourceText;
    if (!writeJson(storage, key, record)) return false;
    const entry = { id, name, savedAt: now, translated, hasSource: withSource };
    return writeJson(storage, INDEX_KEY, [entry, ...others]);
  };

  while (others.length >= MAX_SESSIONS) {
    remove(storage, `${PREFIX}session:${others.at(-1).id}`);
    others = others.slice(0, -1);
  }
  if (attempt(true)) return "saved";
  while (others.length) {
    remove(storage, `${PREFIX}session:${others.at(-1).id}`);
    others = others.slice(0, -1);
    if (attempt(true)) return "saved";
  }
  if (attempt(false)) return "saved-without-source";
  remove(storage, key);
  return "failed";
}

export function loadPrefs(storage) {
  const prefs = readJson(storage, PREFS_KEY);
  return prefs && typeof prefs === "object" ? prefs : {};
}

export function savePrefs(storage, prefs) {
  writeJson(storage, PREFS_KEY, prefs);
}

export function loadApiKey(storage, provider) {
  try {
    return storage?.getItem(apiKeyKey(provider)) || "";
  } catch {
    return "";
  }
}

/** Stores a provider's key only when the user opted in; an empty key forgets it. */
export function saveApiKey(storage, apiKey, provider) {
  if (!apiKey) {
    remove(storage, apiKeyKey(provider));
    return;
  }
  try {
    storage?.setItem(apiKeyKey(provider), apiKey);
  } catch {
    // The key simply is not remembered.
  }
}
