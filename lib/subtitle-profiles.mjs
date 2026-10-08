// Both editors import standard SRT. Line widths are presentation targets, not
// different proprietary SRT limits. Keep their actual import/style workflows separate.
export const EDITOR_PROFILES = {
  resolve: {
    label: "达芬奇 · DaVinci Resolve",
    suffix: "resolve",
    importHelp: "在媒体池中导入 SRT，再拖到时间线的字幕轨道；核对第一条字幕与原视频的时间位置。",
    styleHelp: "在字幕轨道的 Inspector 中统一设置字体、字号、位置和描边。Resolve 20 可在字幕轨道标题上拖入 Fusion 标题模板。",
    sourceUrl: "https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-17-Editors-Guide.pdf",
    styleSourceUrl: "https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf",
  },
  premiere: {
    label: "PR · Adobe Premiere Pro",
    suffix: "premiere",
    importHelp: "将 SRT 作为字幕文件导入项目并拖入序列，使用 Subtitle 字幕轨道；SRT 应导入为字幕，而不是导入为转录稿。",
    styleHelp: "在 Properties 中调整字幕样式，并保存、应用 Track Style，统一整条字幕轨道；烧录字幕时选择 Burn Captions Into Video。",
    sourceUrl: "https://helpx.adobe.com/premiere/desktop/add-text-images/insert-captions/supported-file-formats-for-captions.html",
    styleSourceUrl: "https://helpx.adobe.com/premiere/desktop/add-text-images/stylize-text/create-linked-and-track-styles.html",
  },
  generic: {
    label: "通用 SRT",
    suffix: "srt",
    importHelp: "通过剪辑软件的字幕导入功能载入 SRT，并核对首条字幕与视频的起始位置。",
    styleHelp: "在目标软件中设置支持中英文的字体、字号、底部居中和描边；最终行宽取决于画幅、字体与字号。",
    sourceUrl: "https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml",
    styleSourceUrl: "https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml",
  },
};

export function getSubtitleProfile(editor = "generic", frame = "landscape") {
  const selectedEditor = Object.hasOwn(EDITOR_PROFILES, editor) ? editor : "generic";
  const portrait = frame === "portrait";
  return {
    ...EDITOR_PROFILES[selectedEditor],
    editor: selectedEditor,
    frame: portrait ? "portrait" : "landscape",
    // 42/16 follows Netflix language guides. 32/12 is our narrower portrait
    // preset; neither Adobe nor Blackmagic mandates these character counts.
    englishLineChars: portrait ? 32 : 42,
    chineseLineChars: portrait ? 12 : 16,
    maxEnglishCps: 20,
    maxChineseCps: 9,
    includeBom: true,
    lineEnding: "\r\n",
  };
}
