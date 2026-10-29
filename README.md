# dsh-workorder-plugin

> Write the work order with an expensive model, hand the labor to a cheap one.

A DeepSeek Harness plugin that splits a coding task in two: a strong model writes a **work order** (goal, files, constraints, acceptance commands, out-of-scope), and a cheap model executes it with a full agent loop. Nothing is accepted on the model's word — the acceptance commands decide.

设计文档见 [`skills/workorder/SKILL.md`](skills/workorder/SKILL.md)。

## 为什么

Agent 循环里每一步都会重发全部历史，成本随步数平方增长。省钱的正确做法不是“换个便宜模型”，而是**别让贵模型待在循环里**：

```
planner（贵，一次调用）  →  工单
executor（便宜，N 轮迭代）→  只拿到工单，看不到对话和推理
验收（命令行）           →  真实退出码 + git diff
```

executor 看不到 planner 想过什么，这正是省钱的地方；代价是工单必须自包含。

## 安装

```powershell
dsh plugin --profile desktop add dsh-workorder-plugin
```

或者手工把仓库放进 `~/.dsh/profiles/desktop/node_modules/dsh-workorder-plugin`，再在 profile 的 `package.json` 里加一行依赖和一条 bundle 记录（见 `cordis.patch.yml` 的结构）。

装完**重启 DSH**。

## 配置

两步。

**1. 同步模型列表** —— 插件的下拉列表来自你 profile 的 provider 配置，装完是空的：

```powershell
node_modules\dsh-workorder-plugin\tools\sync-catalog.ps1
```

它读 `~/.dsh/profiles/desktop/cordis.patch.yml`（就是「模型」设置页写入的那个文件），生成下拉数据。之后每次增减模型，重跑一次再重启。

**2. 选模型** —— 设置 → 插件 → **工单委派**：

| 字段 | 说明 |
|---|---|
| planner 提供方 / 模型 | 写工单的那个，贵一点无妨，每个任务只调一次 |
| executor 提供方 / 模型 | 干活的，选额度大、单价低的 |

两者可以来自不同 provider。

## 使用

正常对话就行。插件会往系统提示里注入一段门禁：

- 有可执行验收命令 → 先出工单再执行
- 「改一个文件且改动 < 20 行」或用户说“直接改” → 自己动手
- 新建文件 ≥ 50 行 → 必须派单

每次都会在回复第一行写明 `派单：…` 或 `未派单：…`，你可以当场驳回。

## 关掉它

停用插件（或从 profile 的 bundles 里移除）后，门禁、技能、设置页一起消失，回到原生行为。

## 已知限制

- **下拉列表是静态的**。模型配置变了要重跑 `sync-catalog.ps1` 并重启——浏览器侧没有稳定的目录 API 可用。
- **工单质量决定成败**。planner 写歪了，executor 会非常认真地做错事。`out_of_scope` 不是形式主义。
- **`report.tests_passed` 是自述，不是证据**。验收必须自己跑命令、看 diff、确认 `tests/` 零改动。
- **视觉能力靠 provider 配置声明**。`input` 里没有 `image` 的模型不会标 👁，即使它实际支持读图。

## License

MIT
