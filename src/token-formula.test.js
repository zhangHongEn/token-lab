import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFormula } from "./token-formula.js";
import { createSessionConfig } from "./session-defaults.js";
import { resolveStepToken, validateFlow } from "./session-flow.js";
import { createComparisonConfig, readComparisonConfig } from "./comparison.js";
import Session from "./session.js";

test("公式遵循 JS 运算优先级，支持函数、比较、条件和短路", () => {
  const values = { count: 3, length: 1.5 };
  for (const [expression, expected] of [
    ["(count + 1) * length", 6], ["2 ** 3 ** 2", 512], ["5 % 2 + 1e-3", 1.001],
    ["Math.min(Math.ceil(length * count), 10)", 5], ["Math.sqrt(16) + Math.pow(2, 3)", 12],
    ["count >= 3 && length < 2 ? 4 : 5", 4], ["count === 0 ? 1 / 0 : 2", 2],
    ["0 && (1 / 0)", 0], ["count || 1 / 0", 3], ["Math.PI / Math.PI", 1],
    ["!false ? +count : -1", 3], ["Math.round(1.2) + Math.floor(1.8)", 2],
  ]) assert.equal(evaluateFormula(expression, values), expected, expression);
});

test("只解释受支持的表达式，拒绝全局访问、赋值、函数定义及隐藏分支", () => {
  const values = { count: 3 };
  for (const expression of [
    "window", "globalThis", "process.env", "count.constructor", "Math.constructor", "__proto__",
    "count = 10", "count++", "(()=>1)()", "new Number(1)", "fetch('https://example.com')",
    "Math.random()", "Math['ceil'](1.5)", "Math.max(...[1,2])", "1; 2", "(1, 2)",
    "true ? 1 : missing", "true ? 1 : (count = 5)", "Math.max.constructor('return 1')()",
    "'1'", "[1]", "({length:1}).length", "1n", "true", "1/0", "0/0", "-1", "Math.sqrt(-1)",
    "", "count *", "1".repeat(2001), "(".repeat(1000) + "1" + ")".repeat(1000),
    Array(260).fill("1").join(" + "),
  ]) assert.throws(() => evaluateFormula(expression, values), undefined, expression);
  assert.equal(values.count, 3);
});

test("缓存公式按本方案的最新变量计算，不共享不同方案的数值", () => {
  assert.equal(evaluateFormula("count * 2", { count: 2 }), 4);
  assert.equal(evaluateFormula("count * 2", { count: 7 }), 14);
  assert.throws(() => evaluateFormula("count * 2", {}), /未知/);
  assert.throws(() => evaluateFormula("count * 2", { count: NaN }), /有限/);
  assert.throws(() => evaluateFormula("count * 2", Object.create({ count: 2 })), /未知/);
});

test("流程支持公式、嵌套参数和旧乘积数组，并给出步骤位置", () => {
  const config = createSessionConfig();
  assert.equal(resolveStepToken("initialContext.agentPromptToken + userMessageToken", config), 4.1);
  assert.equal(resolveStepToken("toolResultToken * turnAvgToolsCount", config), 4.5);
  assert.equal(resolveStepToken(["toolResultToken", "turnAvgToolsCount"], config), 4.5);
  assert.equal(resolveStepToken("turnTotalCount / 10", config), 10);
  assert.throws(() => validateFlow({ initial: [], turn: [{ type: "llm", text: "输出", token: "bad + 1" }] }, config), /flow.turn 第 1 步.*未知/);
});

test("公式可导入导出，并用于初始上下文和模型输出的实际计费", () => {
  const config = createComparisonConfig();
  const plan = config.plans[0];
  plan.useGlobal.turnTotalCount = false;
  plan.simulation.turnTotalCount = 1;
  plan.useGlobal.expectedPrefixCacheHitRate = false;
  plan.simulation.expectedPrefixCacheHitRate = 0;
  plan.simulation.flow = {
    initial: [{ type: "action", text: "背景", token: "initialContext.agentPromptToken / 2" }],
    turn: [
      { type: "action", text: "资料", token: "Math.ceil(toolResultToken * turnAvgToolsCount)" },
      { type: "llm", text: "回复", token: "turnAvgToolsCount > 0 ? agentResult * 2 : 0" },
    ],
  };
  const restored = readComparisonConfig(JSON.parse(JSON.stringify(config))).plans[0];
  assert.deepEqual(restored.simulation.flow, plan.simulation.flow);
  const session = new Session({ ...restored.simulation, model: { inputCachedPrice: 1, inputNotCachedPrice: 2, outputPrice: 3 } });
  session.reset();
  const result = session.getConsumptionTokens();
  assert.equal(result.totalInputNotCached, 7);
  assert.equal(result.totalOutput, 2);
  assert.equal(result.totalPrice, 0.02);
});

test("运行索引随用户轮次和已启用模型调用变化，压缩不插入计数，reset 重置", () => {
  const session = new Session({
    turnTotalCount: 4, compressionThresholdTurnCount: 2, compressionKeepTurns: 0,
    flow: {
      initial: [{ type: "action", text: "初始索引", token: "turnIndex + llmIndex" }],
      turn: [
        { type: "action", text: "轮首", token: "turnIndex + llmIndex" },
        { type: "llm", text: "调用一", token: "turnIndex * 10 + llmIndex" },
        { type: "llm", text: "已停用", token: 999, enabled: false },
        { type: "action", text: "返回", token: "llmIndex" },
        { type: "llm", text: "调用二", token: "turnIndex * 10 + llmIndex" },
        { type: "action", text: "轮末", token: "llmIndex" },
      ],
    },
  });
  const verify = () => {
    assert.equal(session.getInitialContext()[0].token, 0);
    const turns = session.turns.filter(turn => turn.kind === "user");
    assert.deepEqual(turns.map(turn => turn.turnIndex), [0, 1, 2, 3]);
    assert.deepEqual(turns.map(turn => turn.actions.filter(action => action.type === "llm").map(action => action.output.token)), [[0, 1], [10, 11], [20, 21], [30, 31]]);
    assert.deepEqual(turns.map(turn => turn.actions.find(action => action.group === "返回").token), [1, 1, 1, 1]);
    assert.deepEqual(turns.map(turn => turn.actions.find(action => action.group === "轮末").token), [2, 2, 2, 2]);
    assert.equal(session.turns.filter(turn => turn.kind === "compression").length, 2);
  };
  session.reset(); verify(); session.reset(); verify();
});

test("运行变量不从用户参数覆盖，公式随传入的运行上下文计算", () => {
  const config = { ...createSessionConfig(), turnIndex: 999, llmIndex: 999 };
  assert.equal(resolveStepToken("turnIndex + llmIndex", config), 0);
  assert.equal(resolveStepToken("turnIndex + llmIndex", config, { turnIndex: 2, llmIndex: 3 }), 5);
});

test("后续轮次的无效公式报告具体轮次及步骤，避免产生无效费用", () => {
  const session = new Session({ turnTotalCount: 3, flow: { initial: [], turn: [
    { type: "llm", text: "变长回复", token: "turnIndex === 2 ? -1 : 1" },
  ] } });
  assert.throws(() => session.reset(), /flow.turn 第 1 步「变长回复」（turnIndex=2, llmIndex=0）.*非负/);
});

test("流程校验在第二次调用中使用正确的 llmIndex", () => {
  const config = createSessionConfig();
  const flow = { initial: [], turn: [
    { type: "llm", text: "停用", token: 1, enabled: false },
    { type: "llm", text: "第一", token: 1 },
    { type: "llm", text: "第二", token: "1 / llmIndex" },
  ] };
  assert.doesNotThrow(() => validateFlow(flow, config));
  flow.turn[1].enabled = false;
  assert.throws(() => validateFlow(flow, config), /flow.turn 第 3 步.*有限/);
});
