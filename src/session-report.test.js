import test from "node:test";
import assert from "node:assert/strict";
import Session from "./session.js";
import { simulate as simulateComparison, buildReport } from "./session-report.js";
import { createConfig, createPresetConfig, validate, readConfig } from "./config.js";
import { modelPresets } from "./model-pricing.js";
import { money, csvCell } from "./utils.js";
import { sourceOption } from "./charts.js";
import { createComparisonConfig, createPlan } from "./comparison.js";
import { createDefaultFlow, createPreloadedFlow } from "./session-flow.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-10), actual + " != " + expected);
const setup = (simulation = {}) => {
  const config = createConfig();
  Object.assign(config.simulation, simulation);
  return config;
};

// 单会话测试显式包装为一个方案；默认模板测试分别传入两套流程。
const simulate = config => {
  const plan = createPlan({ source: config, id: "test-plan" });
  return simulateComparison({ version: 4, unit: "K", baselineId: plan.id, plans: [plan] });
};
const simulateTemplates = config => {
  const comparison = createComparisonConfig();
  comparison.plans.forEach(plan => {
    const flow = plan.simulation.flow;
    plan.useGlobal = { turnTotalCount: false, toolsTotalCount: false };
    plan.simulation = { ...structuredClone(config.simulation), flow };
    plan.model = { ...config.model };
  });
  return simulateComparison(comparison);
};

test("默认选择第一个模型，重置时恢复其费率和元数据", () => {
  const first = modelPresets[0];
  const config = createConfig();
  assert.equal(config.pricing.id, first.id);
  assert.equal(config.model.name, first.name);
  assert.equal(config.model.currency, "$");
  assert.deepEqual([config.model.inputCachedPrice, config.model.inputNotCachedPrice, config.model.outputPrice], [first.hit, first.miss, first.output]);
  config.model.inputCachedPrice = 999;
  config.pricing.contextWindow = 1;
  const reset = createConfig();
  assert.equal(reset.model.inputCachedPrice, first.hit);
  assert.equal(reset.pricing.contextWindow, first.contextWindow);
  assert.deepEqual(validate(reset), {});
});

test("Session 不提供默认费率，计费必须显式传入全部单价", () => {
  const session = new Session({ turnTotalCount: 1 });
  assert.deepEqual(session.config.model, {});
  assert.throws(() => session.getConsumptionTokens(), /inputCachedPrice/);
  const partial = new Session({ model: { inputCachedPrice: 1 } });
  assert.throws(() => partial.getConsumptionTokens(), /inputNotCachedPrice/);
  Object.assign(session.config.model, { inputCachedPrice: 0, inputNotCachedPrice: 0, outputPrice: 0 });
  session.reset();
  assert.equal(session.getConsumptionTokens().totalPrice, 0);
});

test("导入其他模型或自定义费率不继承默认模型上下文限制", () => {
  const config = createConfig();
  const preset = modelPresets.find(p => !p.contextWindow);
  Object.assign(config, createPresetConfig(preset));
  assert.deepEqual(readConfig(JSON.parse(JSON.stringify(config))), config);
  delete config.pricing;
  const imported = readConfig(config);
  assert.equal(imported.pricing.id, "custom");
  assert.equal(imported.pricing.contextWindow, undefined);
  assert.deepEqual(imported.model, config.model);
});
function checkConservation(result) {
  const total = key => result.requests.reduce((sum, r) => sum + r[key], 0);
  for (const key of ["hit", "miss", "output"]) {
    close(total(key), result[key]);
    close(result.sources.reduce((sum, s) => sum + s[key], 0), result[key]);
  }
  close(result.sources.reduce((sum, s) => sum + s.cost.total, 0), result.cost.total);
  close(result.rounds.reduce((sum, r) => sum + r.cost, 0), result.cost.total);
  close(result.requests.reduce((sum, r) => sum + r.cost.total, 0), result.cost.total);
  close(result.rounds.at(-1).context, result.finalContext);
  for (const request of result.requests) {
    for (const key of ["hit", "miss", "output"]) close(request.attribution.reduce((sum, s) => sum + s[key], 0), request[key]);
    close(request.input, request.hit + request.miss);
  }
  assert.equal(result.rounds.flatMap(r => r.requestIds).length, result.requests.length);
  assert.doesNotThrow(() => JSON.stringify(result));
}

test("10 轮基准，末轮压缩请求和最终上下文完整计入", () => {
  const results = simulateTemplates(setup({ turnTotalCount: 10, skillsTotalCount: 1 }));
  const expected = [
    [41, 6.089, 1588.9941, 255.1049, 19, 25.799, 6.12874995],
    [31, 51.989, 2365.2981, 332.7109, 18, 69.969, 8.18847795],
  ];
  results.forEach((r, i) => {
    const [requests, initial, hit, miss, output, final, cost] = expected[i];
    assert.equal(r.requests.length, requests);
    close(r.initialContext, initial); close(r.hit, hit); close(r.miss, miss);
    close(r.output, output); close(r.finalContext, final); close(r.cost.total, cost);
    assert.deepEqual(r.compressions[0].compressedRounds, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(r.compressions[0].keptRounds, [9, 10]);
    assert.equal(r.rounds.at(-1).requestIds.length, i ? 4 : 5);
    assert.equal(r.requests.at(-1).stage, "上下文压缩");
    checkConservation(r);
  });
});

test("重复压缩、用户轮次编号及逐轮上下文与 Session 实际快照一致", () => {
  const config = setup({ turnTotalCount: 30 });
  for (const flow of [createDefaultFlow(), createPreloadedFlow()]) {
    const session = new Session({ ...config.simulation, model: config.model, flow });
    const contexts = [];
    for (let i = 0; i < 30; i++) {
      session.startNewTurn();
      contexts.push(session.getContextSnapshot().turns.flatMap(t => t.actions).reduce((sum, a) => sum + (a.type === "llm" ? 0 : a.token), 0));
    }
    const report = buildReport(session);
    report.rounds.forEach((r, i) => close(r.context, contexts[i]));
    assert.deepEqual(report.compressions.map(c => c.round), [10, 18, 26]);
    assert.deepEqual(report.compressions[1].compressedRounds, [9, 10, 11, 12, 13, 14, 15, 16]);
    assert.deepEqual(report.compressions[1].keptRounds, [17, 18]);
    assert.ok(report.sources.find(s => s.key === "compression retained turns").hit > 0);
    checkConservation(report);
  }
});

test("Token 阈值下两方案独立触发压缩", () => {
  const results = simulateTemplates(setup({ turnTotalCount: 20, compressionThresholdType: "TOKEN", compressionThresholdToken: 80 }));
  assert.notDeepEqual(results[0].compressions.map(c => c.round), results[1].compressions.map(c => c.round));
  results.forEach(checkConservation);
  results.forEach(r => close(r.averageUserTurnsPerCompression, 20 / r.compressions.length));
});

test("平均压缩轮次只统计实际用户消息，包含尾部轮次，重复 reset 不累积", () => {
  const config = setup({ turnTotalCount: 30 });
  const session = new Session({ ...config.simulation, model: config.model });
  assert.equal(session.getConsumptionTokens().averageUserTurnsPerCompression, null);
  for (let i = 0; i < 9; i++) session.startNewTurn();
  assert.equal(buildReport(session).averageUserTurnsPerCompression, null);
  session.startNewTurn();
  assert.equal(buildReport(session).averageUserTurnsPerCompression, 10);
  for (let i = 10; i < 18; i++) session.startNewTurn();
  assert.equal(session.getConsumptionTokens().averageUserTurnsPerCompression, 9);
  assert.equal(buildReport(session).averageUserTurnsPerCompression, 9);
  session.reset();
  assert.equal(session.getConsumptionTokens().averageUserTurnsPerCompression, 10);
  session.reset();
  assert.equal(buildReport(session).averageUserTurnsPerCompression, 10);
});

test("保留零轮、多次压缩及零长度摘要", () => {
  const results = simulate(setup({ turnTotalCount: 12, compressionKeepTurns: 0, compressionThresholdTurnCount: 3, compressionTargetToken: 0 }));
  results.forEach(r => {
    assert.deepEqual(r.compressions.map(c => c.round), [3, 6, 9, 12]);
    assert.ok(r.compressions.every(c => c.keptRounds.length === 0));
    close(r.finalContext, r.initialContext);
    checkConservation(r);
  });
});

test("0% 与 100% 命中只改变分类，所有 Token 归因守恒", () => {
  const none = simulate(setup({ turnTotalCount: 18, expectedPrefixCacheHitRate: 0 }));
  const all = simulate(setup({ turnTotalCount: 18, expectedPrefixCacheHitRate: 1 }));
  none.forEach((r, i) => {
    close(r.hit, 0);
    close(r.miss, all[i].hit + all[i].miss);
    close(r.output, all[i].output);
    close(r.finalContext, all[i].finalContext);
    close(r.requests[0].prefix, r.initialContext);
    checkConservation(r); checkConservation(all[i]);
  });
});

test("零内容和零价格不丢弃请求，末次输出费用归因完整", () => {
  const config = setup({ turnTotalCount: 1 });
  const base = simulate(config);
  base.forEach(r => {
    const final = r.sources.find(s => s.key === "agent_result");
    close(final.output, 1); close(final.hit + final.miss, 0);
    close(r.sources.find(s => s.key === "call_tools").output, 0);
  });
  Object.assign(config.model, { inputCachedPrice: 0, inputNotCachedPrice: 0, outputPrice: 0 });
  simulate(config).forEach((r, i) => {
    close(r.cost.total, 0); close(r.hit, base[i].hit);
    assert.equal(r.equivalent, null); checkConservation(r);
  });
  for (const key of Object.keys(config.simulation)) {
    if (["compressionThresholdType", "compressionThresholdTurnCount", "compressionThresholdToken", "turnTotalCount", "initialContext", "flow"].includes(key)) continue;
    config.simulation[key] = 0;
  }
  config.simulation.initialContext.agentPromptToken = 0;
  simulate(config).forEach((r, i) => {
    assert.equal(r.requests.length, i ? 3 : 4);
    assert.equal(r.hitRate, null); checkConservation(r);
  });
});

test("配置校验与快照往返：不兼容旧版本，不替换费率", () => {
  const config = createConfig();
  assert.deepEqual(validate(config), {});
  config.model.inputCachedPrice = 0.12345;
  assert.deepEqual(readConfig(JSON.parse(JSON.stringify(config))), config);
  for (const value of [-1, Infinity, NaN, ""]) assert.ok(validate(setup({ userMessageToken: value })).userMessageToken);
  assert.ok(validate(setup({ turnTotalCount: 1001 })).turnTotalCount);
  assert.ok(validate(setup({ turnTotalCount: 1.2 })).turnTotalCount);
  assert.ok(validate(setup({ expectedPrefixCacheHitRate: 1.01 })).expectedPrefixCacheHitRate);
  assert.ok(validate(setup({ compressionKeepTurns: 10 })).compressionThresholdTurnCount);
  assert.ok(validate(setup({ compressionThresholdType: "TOKEN", compressionThresholdToken: 0 })).compressionThresholdToken);
  assert.throws(() => readConfig({ version: 1 }));
  assert.throws(() => readConfig({ ...config, unit: "Token" }));
  assert.throws(() => readConfig({ ...config, simulation: {} }));
});

test("1000 轮分页数据完整、压缩汇总守恒", () => {
  const results = simulateTemplates(setup({ turnTotalCount: 1000 }));
  results.forEach((r, i) => {
    assert.equal(r.rounds.length, 1000);
    assert.equal(r.requests.length, 1000 * (i ? 3 : 4) + r.compressions.length);
    checkConservation(r);
  });
});

test("小额非零费用不显示为零，CSV 防止公式注入", () => {
  assert.equal(money(0), "$0");
  assert.notEqual(money(0.00001), "$0.00");
  assert.match(money(1e-10), /e-10/);
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('a"b'), '"a""b"');
});

test("自定义 initial 与每轮步骤按顺序执行，缓存及费用归因使用真实快照", () => {
  const config = setup({
    turnTotalCount: 1, expectedPrefixCacheHitRate: 1,
    flow: {
      initial: [
        { type: "action", text: "系统约束", token: 2 },
        { type: "action", text: "业务背景", token: 3 },
      ],
      turn: [
        { type: "action", text: "客户提问", token: 1 },
        { type: "llm", text: "检索计划", token: 2 },
        { type: "action", text: "检索结果", token: 3 },
        { type: "action", text: "额外资料", token: 4 },
        { type: "llm", text: "业务答复", token: 5 },
      ],
    },
  });
  const session = new Session({ ...config.simulation, model: config.model });
  session.reset();
  const [first, last] = session.getConsumptionTokens().llms;
  assert.deepEqual(first.input.turns.flatMap(t => t.actions).map(a => a.group), ["系统约束", "业务背景", "客户提问"]);
  assert.deepEqual([first.cachedToken, first.notCachedToken, first.output.token], [5, 1, 2]);
  assert.deepEqual([last.cachedToken, last.notCachedToken, last.output.token], [6, 9, 5]);
  const report = buildReport(session);
  assert.deepEqual(report.requests.map(r => r.stage), ["检索计划", "业务答复"]);
  assert.equal(report.requests[0].toolResult, 7);
  assert.equal(report.finalContext, 20);
  assert.equal(report.rounds.length, 1);
  checkConservation(report);
  // 调整顺序后，首个请求的上下文也随之改变。
  [config.simulation.flow.turn[0], config.simulation.flow.turn[1]] = [config.simulation.flow.turn[1], config.simulation.flow.turn[0]];
  assert.equal(simulate(config)[0].requests[0].input, 5);
});

test("流程支持参数乘积、停用步骤和连续模型调用，步骤名称不影响执行", () => {
  const config = setup({
    turnTotalCount: 1, toolsTotalCount: 2, toolSchemaToken: 3,
    flow: {
      initial: [{ type: "action", text: "自定义 Schema", token: ["toolsTotalCount", "toolSchemaToken"] }],
      turn: [
        { type: "llm", text: "首次生成", token: "agentResult" },
        { type: "llm", text: "按需补充", token: 2 },
        { type: "action", text: "已停用", token: 999, enabled: false },
        { type: "llm", text: "最终生成", token: 3 },
      ],
    },
  });
  const [report] = simulate(config);
  assert.deepEqual(report.requests.map(r => r.input), [6, 7, 9]);
  assert.equal(report.initialContext, 6);
  assert.equal(report.finalContext, 12);
  assert.equal(report.sources.find(s => s.key === "已停用").cost.total, 0);
  checkConservation(report);
});

test("图表提示中的自定义步骤名称作为文字显示", () => {
  const results = simulate(setup({ turnTotalCount: 1 }));
  const option = sourceOption(results, "$");
  const html = option.tooltip.formatter({ name: '<img src=x onerror="alert(1)">', value: 1, percent: 100, color: "#fff" });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("无模型调用、空流程和轮末附加内容仍正确检查压缩与记录上下文", () => {
  for (const turn of [[], [{ type: "action", text: "记录", token: 2 }]]) {
    const results = simulate(setup({
      turnTotalCount: 5, compressionThresholdTurnCount: 2, compressionKeepTurns: 0, compressionTargetToken: 1,
      flow: { initial: [], turn },
    }));
    results.forEach(report => {
      assert.deepEqual(report.compressions.map(c => c.round), [2, 4]);
      assert.equal(report.requests.length, 2);
      assert.equal(report.rounds.length, 5);
      assert.equal(report.averageUserTurnsPerCompression, 2.5);
      assert.equal(report.finalContext, turn.length ? 3 : 1);
      checkConservation(report);
    });
  }
  const results = simulate(setup({
    turnTotalCount: 1, compressionThresholdType: "TOKEN", compressionThresholdToken: 10, compressionKeepTurns: 0,
    flow: { initial: [], turn: [{ type: "llm", text: "生成", token: 1 }, { type: "action", text: "大段结果", token: 10 }] },
  }));
  results.forEach(report => {
    assert.equal(report.compressions.length, 1);
    assert.equal(report.compressions[0].before, 11);
    checkConservation(report);
  });
});

test("自定义名称不会误判压缩请求或破坏按名称聚合", () => {
  const reports = simulate(setup({
    turnTotalCount: 5, compressionThresholdTurnCount: 2, compressionKeepTurns: 0,
    flow: {
      initial: [{ type: "action", text: "__proto__", token: 1 }],
      turn: [{ type: "action", text: "constructor", token: 1 }, { type: "llm", text: "compress history", token: 1 }],
    },
  }));
  reports.forEach(report => {
    assert.equal(report.requests.filter(r => r.compression).length, 2);
    assert.equal(report.requests.filter(r => !r.compression).length, 5);
    assert.ok(report.sources.find(s => s.key === "__proto__").hit > 0);
    assert.ok(report.sources.find(s => s.key === "constructor").miss > 0);
    checkConservation(report);
  });
});

test("reset 按最新配置重建 initial，引用稳定且动作编号唯一，会话之间互不影响", () => {
  const config = setup({ turnTotalCount: 1 });
  const first = new Session({ ...config.simulation, model: config.model });
  const second = new Session({ ...config.simulation, model: config.model });
  first.reset();
  const previous = first.getInitialContext()[0];
  assert.equal(first.getInitialContext()[0], first.getInitialContext()[0]);
  first.config.initialContext.agentPromptToken = 12;
  first.config.flow.initial.reverse();
  first.config.flow.turn = [{ type: "llm", text: "自定义回复", token: 2 }];
  first.reset();
  assert.notEqual(first.getInitialContext().at(-1), previous);
  assert.equal(first.getInitialContext().at(-1).token, 12);
  const actions = first.turns.flatMap(t => t.actions);
  assert.equal(new Set(actions.map(a => a.actionIndex)).size, actions.length);
  second.reset();
  assert.equal(second.getInitialContext()[0].group, "agent prompt");
  assert.equal(second.getInitialContext()[0].token, 4);
  assert.equal(config.simulation.flow.initial[0].text, "agent prompt");
  assert.deepEqual(second.config.flow, config.simulation.flow);
  const before = buildReport(first);
  first.reset();
  assert.deepEqual(buildReport(first), before);
});

test("自定义流程经过 JSON 和 Worker 克隆后保留，缺省流程及单阶段覆盖使用默认值", () => {
  const config = setup({ turnTotalCount: 3 });
  config.simulation.flow.initial = [];
  config.simulation.flow.turn = [{ type: "llm", text: "直接回复", token: 2 }];
  const imported = readConfig(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(imported, config);
  assert.deepEqual(simulate(structuredClone(imported)), simulate(config));
  delete config.simulation.flow;
  assert.deepEqual(readConfig(config).simulation.flow, createConfig().simulation.flow);
  const session = new Session({ flow: { initial: [] } });
  assert.deepEqual(session.getInitialContext(), []);
  assert.deepEqual(session.config.flow.turn, createConfig().simulation.flow.turn);
});

test("非法流程在导入与 Session 执行前被拒绝", () => {
  const badFlows = [
    null, [], 0, { initial: null }, { turn: {} },
    { initial: [{ type: "llm", text: "无效初始请求", token: 1 }] },
    ...[
      null,
      { type: "unknown", text: "a", token: 1 },
      { type: "action", text: " ", token: 1 },
      { type: "action", text: "a", token: -1 },
      { type: "llm", text: "a", token: "missingParameter" },
      { type: "action", text: "a", token: [] },
      { type: "action", text: "a", token: ["__proto__"] },
      { type: "action", text: "a", token: 1, enabled: "false" },
      { type: "action", text: "a", token: 1, toolsMode: "unknown" },
    ].map(step => ({ turn: [step] })),
  ];
  for (const flow of badFlows) {
    assert.throws(() => new Session({ flow }), /flow/);
    assert.throws(() => readConfig(setup({ flow })), /flow/);
  }
  for (const value of [Infinity, NaN]) {
    assert.throws(() => new Session({ flow: { turn: [{ type: "llm", text: "a", token: value }] } }), /Token/);
  }
  assert.throws(() => new Session({
    toolsTotalCount: 1e300, toolSchemaToken: 1e300,
    flow: { initial: [{ type: "action", text: "溢出", token: ["toolsTotalCount", "toolSchemaToken"] }] },
  }), /超出/);
  const session = new Session();
  session.config.flow.turn[0].token = -1;
  assert.throws(() => session.reset(), /Token/);
});
