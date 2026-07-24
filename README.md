# Hello World

A minimal responsive website with “Hello World” centered in the viewport.

## Deploy to Cloudflare

Connect this repository to Cloudflare Workers & Pages. No build command is required; use the repository root as the static asset directory.

## 知识内容管线

知识源保持只读，网站使用 `content/` 中已清理本地绝对路径的副本，并生成到 `knowledge/library/`。

```powershell
$knowledgeSource = "你的知识目录"
npm run knowledge:all -- --source $knowledgeSource
```

只重新生成现有内容时：

```powershell
npm run knowledge:build
```
