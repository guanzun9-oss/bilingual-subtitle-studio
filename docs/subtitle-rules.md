# 字幕规则与来源

核对日期：2026-10-07。以下区分公开专业规范、用户约束和本工具的实现选择。
这是面向 Buzz SRT 的整理方案，不等同于 Netflix 或广播平台的完整交付认证。

## 查阅的原始资料

| 原始资料 | 采用的原则 |
| --- | --- |
| [Netflix 英文指南](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide) | 英文每行 42 字符，通常先用单行；超长时再换行。换行尽量保护语法组，成人节目阅读速度参考 20 字符/秒。省略号也可能表示停顿。 |
| [Netflix 简体中文指南](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide) | 中文每行 16 字，通常先用单行；成人节目阅读速度参考 9 字/秒。 |
| [Netflix 通用要求](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements) | 事件时长参考 5/6 秒至 7 秒。 |
| [Netflix 时间指南](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines) | 音频、镜头与字幕时间应配合；精确时间需要音频和画面参考。 |
| [DCMP Captioning Key](https://dcmp.org/captioningkey/print) | 尽量在自然停顿处分行，保持人名、称谓、介词短语和助动词组完整。同一行一般避免前一句结束后再开始下一句，但允许极短、相关的句子例外。 |
| [Adobe 字幕格式](https://helpx.adobe.com/premiere/desktop/add-text-images/insert-captions/supported-file-formats-for-captions.html)、[创建字幕](https://helpx.adobe.com/ca/premiere/desktop/add-text-images/insert-captions/create-captions.html)、[轨道样式](https://helpx.adobe.com/premiere/desktop/add-text-images/stylize-text/create-linked-and-track-styles.html) | Premiere 支持 SRT；字幕的行数、样式需要按工作流程配置；轨道样式可统一外观。 |
| [Blackmagic 官方编辑指南](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-17-Editors-Guide.pdf)、[Resolve 20 新功能指南](https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf) | SRT 可导入媒体池再加入字幕轨道；Resolve 20 支持在字幕轨道上应用 Fusion 模板。导入操作引用官方 Resolve 17 教程，不声称已实测所有后续版本。 |
| [美国国会图书馆 SRT 格式说明](https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml) | SRT 保存编号、文本、换行与毫秒时间；有限样式的呈现取决于读取软件。 |

BBC 官方字幕指南在本次查询中被访问限制阻挡，没有据此宣称已核验其当前规则。

## 必须满足的用户约束

1. 每条 Buzz 原字幕独立处理，原条目之间绝不合并，即使它们属于同一句话。
2. 句号、问号、感叹号结束一句后，后面的内容必须另起一个字幕条目，与句长无关。
3. 保留原文内容及顺序，只调整条目和换行，不改写英文、不补标点、不删除短句。
4. 短句保持单行，只有超过行宽建议值时才换行。
5. 能选择达芬奇、Premiere Pro 或通用 SRT，提供对应导入、轨道样式与排版说明。

“每个完整句子单独成条”和“只拆分、不合并”是本项目的明确约束，比部分专业
规范更严格；不能把它们描述成所有专业字幕团队都遵循的统一硬性标准。

## 处理优先级

先保留原条目边界，再识别句末，最后在每句话内部处理长度和换行。

- 支持中英文句号、问号和感叹号，无空格的连续句子也能分开。
- 连续标点以及紧随的闭引号、闭括号留在前一句，避免出现孤立标点条目。
- 小数、常见英文称谓与首字母缩写不直接按句号切开。缩写同时位于句尾的情况
  按后文判断；仅有文本时仍可能存在歧义。
- 省略号可能表示犹豫，不无条件视作句末。英文省略号后接大写新句起点时可
  分开；小写续句或无明确句末的中文续句保持在同一句内。这是文本启发式，
  无法替代音频判断。
- 超长句优先在自然标点、连词或介词之前切分，尽量避免把冠词、代词、助动词
  或称谓留在前一行末尾。姓名使用保守启发式；没有完整词性分析，不保证所有
  形容词、名词组、短语动词都能被正确识别。
- 英文单个超长单词保持完整，并提示行宽问题，避免从单词中间截断原文。
- “句内换行”模式仍在句末创建新条目；单句话过长时可超过两行，并在预览提示。

## 单行与画幅

| 画幅 | 英文建议行宽 | 中文建议行宽 | 来源性质 |
| --- | --- | --- | --- |
| 横屏 16:9 | 42 字符 | 16 字 | 参考 Netflix 语言指南 |
| 竖屏 9:16 | 32 字符 | 12 字 | 本工具较窄的排版预设，不是软件官方硬性限制 |

两个剪辑软件都使用标准 SRT，因此不虚构不同的专有字符限制。画幅改变会实际
改变英文换行、长度拆分、中文导出换行与阅读检查。

单种语言短句是一行；双语同时呈现时，中文、英文各自至少一行。这和将每种
语言都强制排成两行不同。规范里的最多两行通常针对单个语言字幕，不能声称
双语叠加后的四行符合单语交付要求。

## 时间与质量检查

- 不拆分的原条目保持原起止时间。
- 拆分只在对应原条目内部，按原文本位置估算切点；首条沿用原开始时间，末条
  沿用原结束时间。子条目连续、不增加重叠，原条目之间的停顿保持不变。
- 原文件已有的重叠不会被擅自消除。
- 不通过跨条目合并、越过原边界延长、删字等方式强行满足最小时长。
- 显示过短或过长、阅读速度偏快、行宽或行数偏多时提示校对，不拒绝有效译文，
  也不反复翻译或阻止导出。
- 原条目时间短到无法在毫秒精度内分配子条目时显示明确错误，避免产生负时长
  或超出原时间范围的字幕。
- 没有视频、音频或帧率，无法实现逐词对齐、镜头切点或按帧留空隙，不凭空
  假设 24/25/30 fps。

## 平台适配

- 为两个编辑器提供标准毫秒 SRT，使用 UTF-8 BOM 和 CRLF 作为兼容性选择，
  不声称官方强制这两种设置。文件名标明所选平台。
- 整体时间偏移默认 0，只有用户指定时才统一平移所有条目；不会自动给达芬奇
  文件加一小时。负时间明确报错，不悄悄截为零。
- PR 使用 Subtitle 工作流程和 Track Style；达芬奇使用字幕轨道与 Inspector，
  Resolve 20 另提供 Fusion 模板入口。
- 字体、字号、描边、位置和字幕框需在剪辑软件设置；SRT 无法可靠传递完整样式。
- 浏览器预览复用实际导出换行与双语顺序，是排版模拟，不是剪辑软件的渲染截图。

测试覆盖短句单行、句末拆分、只拆不并、缩写和省略号、原时间边界、两种长句
模式、各平台 SRT 往返解析、竖屏行宽、整体偏移及非阻断质量提示。
