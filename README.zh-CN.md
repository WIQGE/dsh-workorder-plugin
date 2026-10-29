# dsh-workorder-plugin

[English](README.md) | [中文](README.zh-CN.md)

> 用贵模型写工单，把干活的部分交出去。

DeepSeek Harness 插件。它把一个编码任务拆成两半：强模型写一张**工单**（目标、要改哪些文件、不许违反什么、怎么验收、不做什么），便宜模型带着完整的 agent 能力去执行。结论不由模型口头保证——验收命令说了算，改完再看 diff。

## 为什么

Agent 循环里每一步都会重发全部历史，成本随步数平方增长。省钱的关键不是"换个便宜模型"，而是**别让贵模型待在循环里**：

```
planner（贵，一次调用）  →  工单
executor（便宜，N 轮迭代）→  只拿到工单，看不到对话和推理
验收（命令行）           →  真实退出码 + git diff
```

executor 看不到 planner 想过什么，也看不到你说过什么。这种隔离正是省钱的地方；代价是工单必须自包含。

## 安装

```powershell
dsh plugin --profile desktop add dsh-workorder-plugin
```

或者把本仓库放进 `~/.dsh/profiles/desktop/node_modules/dsh-workorder-plugin`，再在 profile 的 `package.json` 里补一条依赖和一条 bundle 记录（结构见 `cordis.patch.yml`）。

装完**重启 DSH**。

## 配置

两步。

**1. 生成模型列表。** 下拉列表来自你 profile 的 provider 配置，装完是空的：

```powershell
node_modules\dsh-workorder-plugin\tools\sync-catalog.ps1
```

它读 `~/.dsh/profiles/desktop/cordis.patch.yml`——就是「模型」设置页写入的那个文件。以后每次增减模型，重跑一次再重启。

**2. 选模型。** 设置 → 插件 → **工单委派**：

| 字段 | 说明 |
|---|---|
| planner 提供方 / 模型 | 写工单的那个。每个任务只调一次，可以选贵的 |
| executor 提供方 / 模型 | 干活的。选额度大、单价低的 |

两个角色可以来自不同 provider。

## 使用

正常对话就行。插件会往系统提示里注入一段常驻门禁：

- 有可执行验收命令 → 先出工单再执行
- 「改一个文件**且**改动 < 20 行」，或你明说"直接改" → 自己动手
- 新建文件 ≥ 50 行 → 必须派单

每次回复第一行会写明 `派单：…` 或 `未派单：…`，你可以当场驳回。

## 关掉它

停用插件（或从 profile 的 bundles 里移除）后，门禁、技能、设置页一起消失，agent 回到原生行为。

## 已知限制

- **下拉列表是静态的。** 模型配置变了要重跑 `sync-catalog.ps1` 再重启——浏览器侧没有稳定的目录 API 可用。
- **工单质量决定成败。** planner 写歪了，executor 会非常认真地照着做错。`out_of_scope` 不是形式主义。
- **`report.tests_passed` 是自述，不是证据。** 验收必须自己跑命令、看 diff、确认 `tests/` 零改动。
- **视觉能力靠声明，不靠探测。** provider 配置里没有 `image` 的模型不会显示 👁，哪怕它实际支持读图。

## License

MIT
