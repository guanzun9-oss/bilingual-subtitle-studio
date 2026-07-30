# 双语字幕工坊

![双语字幕工坊](./public/og-v2.png)

一个面向 Buzz 英文识别字幕的中英双语 SRT 整理工具。它会先重新合并被
Buzz 拆散的短片段，再按照完整语义和自然标点断句，最后调用 DeepSeek API
生成逐条对齐的中文字幕。

[在线体验](https://bilingual-subtitle-studio.realzane.chatgpt.site) ·
[反馈问题](https://github.com/guanzun9-oss/bilingual-subtitle-studio/issues)

> 在线版本为私有站点，打开时需要通过 ChatGPT 安全登录。字幕文件和
> DeepSeek API Key 不会被保存。

## 为什么做这个工具

Buzz 导出的英文 SRT 经常按照识别时间切成很短的片段。直接逐条翻译容易出现：

- 一个完整英文句子被拆成多条，中文和英文含义错位
- 短片段缺少上下文，AI 把下一条内容提前翻译
- 单条字幕过长，画面上阅读体验不佳
- 网络或模型响应异常后，整批翻译需要重新开始

双语字幕工坊会先恢复完整句子的上下文，再生成适合观看的字幕条目，并在翻译
中断时保留已经完成的进度。

## 主要功能

- 解析标准 SRT，兼容 UTF-8 BOM 与 Windows 换行
- 自动合并 Buzz 拆散的相邻短时间块
- 优先在句号、问号、逗号和分号等自然位置断句
- 可调节每条英文字幕的建议长度
- 可选择拆成新时间条目，或仅在原字幕内换行
- 拆分后按文字比例分配时间，保持原始首尾时间范围
- 通过完整句子上下文提高翻译准确度，同时保持逐条严格对应
- 分批调用 DeepSeek，网络或返回格式异常时自动重试
- 保留已完成译文，中断后可继续翻译剩余字幕
- 支持中文在上或英文在上的双语顺序
- 支持逐条校对译文并导出带 UTF-8 BOM 的 SRT

## 使用流程

1. 从 Buzz 导出英文 `.srt` 文件。
2. 将文件拖入工具，调整字幕建议长度和断句方式。
3. 填写自己的 DeepSeek API Key，选择翻译模型和双语顺序。
4. 开始翻译；如遇网络中断，可继续处理尚未完成的条目。
5. 在预览区校对译文，下载中英双语 SRT。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
git clone https://github.com/guanzun9-oss/bilingual-subtitle-studio.git
cd bilingual-subtitle-studio
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 测试与构建

```bash
npm test
npm run build
```

测试覆盖 SRT 解析、Buzz 短片段合并、自然断句、时间范围保持、双语导出和页面
服务端渲染。

## 技术栈

- React 19
- Next.js 16 / vinext
- TypeScript
- Cloudflare Workers
- DeepSeek Chat Completions API

## 隐私说明

- API Key 只随当次翻译请求发送，不写入本地文件或浏览器存储
- 字幕文件只在当前页面中处理，不保存到项目服务器
- 翻译内容会按照 DeepSeek API 的处理流程发送给 DeepSeek

## 参与改进

欢迎通过 [Issues](https://github.com/guanzun9-oss/bilingual-subtitle-studio/issues)
反馈断句样例、翻译异常或界面建议。提交问题时请删除字幕中的私人信息，并且不要
粘贴 API Key。
