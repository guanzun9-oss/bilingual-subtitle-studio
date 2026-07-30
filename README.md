# 双语字幕工坊

把 Buzz 识别生成的英文 SRT 整理为适合观看的短字幕，并通过 DeepSeek API
翻译成中英双语 SRT。

## 功能

- 解析标准 SRT，包括 UTF-8 BOM 与 Windows 换行
- 先合并 Buzz 拆散的同一句短时间块，再进行断句和翻译
- 默认使用更宽松的字幕长度，优先在句号、问号、逗号、分号等自然位置断开
- 可选择拆成新的时间条目，或仅在原字幕内换行
- 拆分新条目时按文字长度分配原时间段，保持首尾时间不变
- 分批调用 DeepSeek V4 Flash 或 V4 Pro，网络或格式异常时自动重试
- 已完成的翻译会保留，中断后可从剩余字幕继续
- 中文在上/英文在上两种双语顺序
- 翻译后可逐条修改，并导出带 UTF-8 BOM 的 SRT
- API Key 仅用于当次请求，不写入文件或浏览器存储

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 验证

```bash
npm run build
npm test
```
