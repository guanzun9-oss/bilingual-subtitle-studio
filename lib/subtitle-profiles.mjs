import { getLanguage, lineCharsFor } from "./languages.mjs";

// Every editor imports standard SRT. Line widths are presentation targets, not
// different proprietary SRT limits. Their import and style instructions are
// in the interface messages (lib/i18n) so they can be read in any language.
export const EDITOR_PROFILES = {
  resolve: {
    suffix: "resolve",
    sourceUrl: "https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-17-Editors-Guide.pdf",
    styleSourceUrl: "https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf",
  },
  premiere: {
    suffix: "premiere",
    sourceUrl: "https://helpx.adobe.com/premiere/desktop/add-text-images/insert-captions/supported-file-formats-for-captions.html",
    styleSourceUrl: "https://helpx.adobe.com/premiere/desktop/add-text-images/stylize-text/create-linked-and-track-styles.html",
  },
  generic: {
    // No editor tag: the file already ends in .srt.
    suffix: "",
    sourceUrl: "https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml",
    styleSourceUrl: "https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml",
  },
};

export function getSubtitleProfile(
  editor = "generic",
  frame = "landscape",
  sourceLanguage = "en",
  targetLanguage = "zh-Hans",
) {
  const selectedEditor = Object.hasOwn(EDITOR_PROFILES, editor) ? editor : "generic";
  const selectedFrame = frame === "portrait" ? "portrait" : "landscape";
  const source = getLanguage(sourceLanguage);
  const target = getLanguage(targetLanguage);
  return {
    ...EDITOR_PROFILES[selectedEditor],
    editor: selectedEditor,
    frame: selectedFrame,
    sourceLanguage: source.code,
    targetLanguage: target.code,
    // English 42 and Chinese 16 follow Netflix language guides; portrait is
    // this tool's narrower preset (42 → 32, 16 → 12). Neither Adobe nor
    // Blackmagic mandates these character counts.
    sourceLineChars: lineCharsFor(source.code, selectedFrame),
    targetLineChars: lineCharsFor(target.code, selectedFrame),
    maxSourceCps: source.cps,
    maxTargetCps: target.cps,
    includeBom: true,
    lineEnding: "\r\n",
  };
}

/**
 * "film.srt" → "film.en-zh-Hans.resolve.srt" (bilingual), "film.en.srt"
 * (source only) or "film.zh-Hans.srt" (translation only). Generic exports
 * carry no editor tag.
 */
export function exportFileName(sourceName, content, suffix, sourceLanguage = "en", targetLanguage = "zh-Hans") {
  const base = (sourceName || "subtitle").replace(/\.srt$/i, "").replace(/[\\/:*?"<>|]/g, "-");
  const languages = content === "source"
    ? sourceLanguage
    : content === "translation"
      ? targetLanguage
      : `${sourceLanguage}-${targetLanguage}`;
  return [base, languages, suffix, "srt"].filter(Boolean).join(".");
}
