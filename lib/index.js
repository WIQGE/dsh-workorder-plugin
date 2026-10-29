/**
 * @dsh-workorder-plugin — registers one bundled skill (`workorder`) into the host's
 * skill registry. No tools, no services, zero runtime dependencies.
 *
 * The provider contract mirrors what the host expects (see the blender
 * plugin's bundled-skill implementation):
 *   { name, list: async () => candidates, get: async () => candidate + content }
 *
 * `list` and `get` MUST return promises: the host registry calls
 * `promise.then(...)` on the result whenever the caller passes an
 * AbortSignal, and a synchronous return makes the provider be skipped
 * silently.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

/**
 * `.volatile()` marks a field as user-editable at runtime: the settings
 * service projects volatile fields into a per-entry form, and writes are
 * persisted back through the profile's cordis patch. That projection is what
 * the browser half binds to with `ctx.configForms.get('dsh-workorder-plugin')`.
 */
export const Config = z.object({
  /** Legacy single-provider field; still honoured as a fallback. */
  provider: z.string().default('').volatile(),
  plannerProvider: z.string().default('').volatile(),
  planner: z.string().default('').volatile(),
  workerProvider: z.string().default('').volatile(),
  worker: z.string().default('').volatile(),
})

const PROVIDER_NAME = 'dsh-workorder-plugin'
const PROVIDER_RANK = 10

const here = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.join(here, '..', 'skills', 'workorder')
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md')

/**
 * Minimal frontmatter reader: `--- name: ... description: ... ---`.
 * The skill file is written by us, so a full YAML parser would be overkill.
 */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return null

  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).trim()
    if (key) meta[key] = line.slice(sep + 1).trim()
  }

  if (!meta.name || !meta.description) return null
  return { meta, content: text }
}

function readSkill() {
  try {
    return parseFrontmatter(readFileSync(SKILL_FILE, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Model defaults. Overridden per install through cordis.patch.yml `config`.
 * Everything is optional -- a missing or blank value falls back here.
 */
const DEFAULT_CONFIG = {
  provider: '',
  planner: '',
  worker: '',
}

/**
 * Volatile config fields arrive as live references (schemastery wraps them in
 * a Volatile object), not plain strings. Unwrap on every read so a value saved
 * from the settings page is picked up without a restart.
 */
function rawValue(raw, key) {
  const value = raw?.[key]
  const plain =
    value && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
  return typeof plain === 'string' ? plain.trim() : ''
}

function normalizeConfig(raw) {
  // `provider` predates the split into per-role providers; keep honouring it so
  // an existing config keeps working until both roles are set explicitly.
  const legacyProvider = rawValue(raw, 'provider')
  return {
    plannerProvider:
      rawValue(raw, 'plannerProvider') || legacyProvider || DEFAULT_CONFIG.provider,
    planner: rawValue(raw, 'planner') || DEFAULT_CONFIG.planner,
    workerProvider: rawValue(raw, 'workerProvider') || legacyProvider || DEFAULT_CONFIG.provider,
    worker: rawValue(raw, 'worker') || DEFAULT_CONFIG.worker,
  }
}

/**
 * Append the effective model pair to the skill body, so the model reads the
 * configured default instead of the prose example in SKILL.md. Kept at the
 * end so the YAML frontmatter stays first.
 */
function appendModelSection(content, cfg) {
  const show = (value) => (value ? `\`${value}\`` : '（未配置）')
  const ready = cfg.planner && cfg.worker
  return `${content.trimEnd()}

## 当前生效的组合（由插件配置生成）

| 角色 | provider | model |
|---|---|---|
| planner | ${show(cfg.plannerProvider)} | ${show(cfg.planner)} |
| executor | ${show(cfg.workerProvider)} | ${show(cfg.worker)} |

${ready ? '除非用户明确要求换，否则按这一组走。' : '这一组还没配全，先让用户去设置页配好再派单。'}要改组合就去「设置 → 插件 → 工单委派」，或直接改 \`cordis.patch.yml\` 的 \`config\`。
`
}

function createProvider(rawConfig) {
  const skill = readSkill()
  if (!skill) return null

  const resourceBase = { kind: 'directory', path: SKILL_DIR.split(path.sep).join('/') }
  const candidate = {
    name: skill.meta.name,
    description: skill.meta.description,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: PROVIDER_NAME,
    rank: PROVIDER_RANK,
    resourceBase,
    path: SKILL_FILE,
    locator: SKILL_FILE,
  }

  return {
    name: PROVIDER_NAME,
    list: async () => [candidate],
    // Recomputed on every read: a value saved from the settings page reaches
    // this closure through the volatile reference, so no restart is needed.
    get: async () => ({ ...candidate, content: appendModelSection(skill.content, normalizeConfig(rawConfig)) }),
  }
}

/**
 * Always-on policy. A skill only appears in the catalog -- the model still has
 * to decide to load it. This section is injected into every request instead, so
 * the decision itself cannot be skipped silently.
 */
const GATE_TEXT = `## 派单门禁（workorder 插件启用期间生效）

改动代码之前先做一次判定，并把结论写在回复的**第一行**：

- 有可执行验收命令 → \`委派：<一句话任务卡摘要>\`。先出任务卡，再交 executor 执行，最后自己跑验收命令。
- 是「改一个文件 **而且** 改动 < 20 行」，或用户明确说"直接改" → \`未委派：<命中哪条>\`。
- 新建文件 ≥ 50 行 → **必须委派**。

不得以"没有现成测试""规格不明确""我得逐行审查""单文件""测不出手感"为由跳过委派——这些都不是理由，拆出可机器验证的部分先委派。

没写第一行结论 = 没做判定。用户看到"未委派"可以当场驳回。`

export function apply(ctx, config) {
  // A skill plugin must never be able to break host startup, so every step
  // is guarded and failures degrade to a warning.
  try {
    const provider = createProvider(config)
    if (!provider) {
      ctx?.logger?.warn?.(`[${PROVIDER_NAME}] skills/workorder/SKILL.md missing or bad frontmatter; skill not registered`)
      return
    }

    const mount = (c) => {
      try {
        c.skills.registerProvider(() => provider)
      } catch (err) {
        ctx?.logger?.warn?.(`[${PROVIDER_NAME}] skill registration failed: ${String(err?.message ?? err)}`)
      }
    }

    if (typeof ctx?.inject === 'function') {
      ctx.inject(['skills'], (c) => mount(c))
    } else if (typeof ctx?.skills?.registerProvider === 'function') {
      mount(ctx)
    }

    registerGate(ctx)
  } catch (err) {
    ctx?.logger?.warn?.(`[${PROVIDER_NAME}] failed to load: ${String(err?.message ?? err)}`)
  }
}

/**
 * Inject the always-on policy section. Kept separate and fully guarded: a
 * profile without the system-prompt service still gets the skill.
 */
function registerGate(ctx) {
  const mount = (c) => {
    try {
      const order =
        typeof c.systemPrompt?.getSectionOrder === 'function'
          ? (c.systemPrompt.getSectionOrder('TEAM_POLICY') ?? 900)
          : 900
      c.systemPrompt.section({ name: 'workorder:gate', order, text: GATE_TEXT })
    } catch (err) {
      ctx?.logger?.warn?.(`[${PROVIDER_NAME}] gate section failed: ${String(err?.message ?? err)}`)
    }
  }

  try {
    if (typeof ctx?.inject === 'function') {
      ctx.inject(['systemPrompt'], (c) => mount(c))
    } else if (typeof ctx?.systemPrompt?.section === 'function') {
      mount(ctx)
    }
  } catch (err) {
    ctx?.logger?.warn?.(`[${PROVIDER_NAME}] gate mount failed: ${String(err?.message ?? err)}`)
  }
}

export { createProvider, parseFrontmatter, GATE_TEXT }
