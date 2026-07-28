# Xianyuwo Knowledge Lab

Xianyuwo Knowledge Lab 是一个面向算法、数据结构、游戏 AI 与工程设计的交互式知识网站。它把抽象概念拆成可观察、可调试的过程，让文章、代码和运行状态保持同步。

## 网站特点

- 逐步演示：按最小可理解单元展开机制、边界与失败路径。
- 手动与自动模式：既能逐步调试，也能用较慢速度连续观察。
- 同步代码与关键状态：每一步同时标出代码位置、数据变化和原因。
- Markdown 知识管线：源文章经统一构建生成可搜索、可链接的知识页面。

## 访问地址

- 在线网站：[https://www.xianyuwo.com](https://www.xianyuwo.com)
- GitHub：[https://github.com/shalted/my-simple-website](https://github.com/shalted/my-simple-website)

## 知识内容管线

网站使用 `content/` 中的 Markdown 内容，并生成到 `knowledge/library/`。

从指定知识目录导入并构建：

```powershell
$knowledgeSource = "你的知识目录"
npm run knowledge:all -- --source $knowledgeSource
```

只重新生成仓库中的现有内容：

```powershell
npm run knowledge:build
```

检查所有静态页面的站内文件、传统锚点和交互场景链接：

```powershell
npm run check:links
```

## 自动部署

`main` 分支推送到 GitHub 后，Cloudflare 会自动发布仓库中的静态网站。提交前应先运行知识构建，并检查生成页面、站内链接与交互行为。