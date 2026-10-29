// DSH workflow：强模型出任务卡 → 便宜模型执行 → 我这边跑确定性测试验收
//
// 用法：把整段脚本交给 workflow 工具执行。只需要改下面三个常量。
// 关键点：executor 只看得到 card 这个 JSON，看不到 planner 的思考过程。

const REPO = String.raw`C:\path\to\your\repo`;

// planner 建议用能扛住"读代码 + 判断"的强模型，但它每轮只调用一次
const PLANNER = { provider: "<你的 provider>", model: "<强模型>" };

// worker 承担全部上下文和迭代，选额度大、单价低的
const WORKER = { provider: "<你的 provider>", model: "<便宜模型>" };

const REQUIREMENT = `把 tests/ 里失败的用例修绿，不许改测试。`;

const CARD_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string" },
    files: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    acceptance_cmds: { type: "array", items: { type: "string" } },
    out_of_scope: { type: "array", items: { type: "string" } },
  },
  required: ["goal", "files", "constraints", "acceptance_cmds", "out_of_scope"],
  additionalProperties: false,
};

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    files_changed: { type: "array", items: { type: "string" } },
    tests_passed: { type: "boolean" },
    rounds: { type: "number" },
    notes: { type: "string" },
  },
  required: ["files_changed", "tests_passed", "rounds", "notes"],
  additionalProperties: false,
};

phase("plan");
const card = await agent(
  `你是技术负责人，不写代码，只出任务卡。

仓库：${REPO}
需求：${REQUIREMENT}

先读相关源码和测试，测试就是契约，以测试已经定义的行为为准，不要发明新接口。
acceptance_cmds 必须是你确认过能跑的命令，不要臆造参数。`,
  { ...PLANNER, label: "planner", schema: CARD_SCHEMA }
);

phase("execute");
const report = await agent(
  `你是执行工程师。按下面这张任务卡在 ${REPO} 里干活。

任务卡：
${JSON.stringify(card, null, 2)}

工作方式：
1. 先读测试文件，那是契约，不要改它
2. 再改实现
3. 每轮改完跑一次验收命令，失败就看报错继续改
4. 直到全部通过；连续 3 轮没进展就停下来说卡在哪里`,
  { ...WORKER, label: "executor", schema: REPORT_SCHEMA }
);

// 注意：report.tests_passed 只是执行者的自述，不能当验收结果。
// 真正的验收要在 workflow 之外自己跑一遍 acceptance_cmds + git diff。
return { card, report };
