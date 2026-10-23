import test from "node:test";
import assert from "node:assert/strict";
import { createConfig, createPresetConfig } from "./config.js";
import { modelPresets } from "./model-pricing.js";
import { createComparisonConfig, createPlan, readComparisonConfig, validateComparison, resolveBaselineId, compareSources, planColors, maxPlans, globalKeys, resolvePlan } from "./comparison.js";
import { simulate } from "./session-report.js";
import { sourceOption, trendOption } from "./charts.js";
import { buildCsv } from "./export.js";

const small = () => {
  const config = createComparisonConfig();
  config.globalSimulation.turnTotalCount = 3;
  return config;
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("默认基准随最高费用方案变化，同价保留首项，手动选择优先", () => {
  const config = small();
  const results = simulate(config);
  assert.equal(config.baselineMode, "auto");
  const highest = results.reduce((best, result) => result.cost.total > best.cost.total ? result : best);
  assert.equal(resolveBaselineId(config, results), highest.planId);
  const changed = structuredClone(results);
  changed[0].cost.total = changed[1].cost.total + 1;
  assert.equal(resolveBaselineId(config, changed), changed[0].planId);
  changed[1].cost.total = changed[0].cost.total + 1;
  assert.equal(resolveBaselineId(config, changed), changed[1].planId);
  changed[0].cost.total = changed[1].cost.total;
  assert.equal(resolveBaselineId(config, changed), changed[0].planId);
  config.baselineMode = "manual";
  config.baselineId = results[0].planId;
  assert.equal(resolveBaselineId(config, results), results[0].planId);
  assert.equal(resolveBaselineId(config, []), null);
  assert.deepEqual(readComparisonConfig(config), config);
  delete config.baselineMode;
  assert.equal(resolveBaselineId(config, results), config.baselineId);
  assert.deepEqual(readComparisonConfig(config), config);
});

test("默认两方案以独立流程表达差异，不再包含模式配置", () => {
  const config = small();
  assert.deepEqual(validateComparison(config), {});
  const results = simulate(config);
  assert.deepEqual(results.map(r => r.planName), ["按需 Tools", "全量 Tools"]);
  assert.ok(config.plans.every(plan => !Object.hasOwn(plan, "toolsMode")));
  assert.ok(results.every(result => !Object.hasOwn(result, "mode")));
  assert.deepEqual(results.map(r => r.requests.length), [12, 9]);
  assert.ok(results[1].initialContext > results[0].initialContext);
  config.plans[0].simulation.flow.initial[0].token = 100;
  config.plans[0].model.inputCachedPrice = 999;
  assert.equal(config.plans[1].simulation.flow.initial[0].token, "initialContext.agentPromptToken");
  assert.notEqual(config.plans[1].model.inputCachedPrice, 999);
});

test("三个方案可使用任意独立流程、费率、轮次", () => {
  const config = small();
  config.plans.push(createPlan({ source: config.plans[0], name: "精简流程", color: planColors[2] }));
  const extra = config.plans[2];
  extra.useGlobal.model = false;
  extra.useGlobal.turnTotalCount = false;
  extra.simulation.turnTotalCount = 7;
  extra.simulation.flow = { initial: [], turn: [{ type: "llm", text: "直接回复", token: 2 }] };
  extra.model.inputCachedPrice = 0;
  extra.model.inputNotCachedPrice = 0;
  extra.model.outputPrice = 10;
  const results = simulate(config);
  assert.equal(results.length, 3);
  assert.equal(results[0].rounds.length, 3);
  assert.equal(results[2].requests.length, 7);
  close(results[2].cost.total, 0.14);
  const before = results[0].cost.total;
  extra.model.outputPrice = 20;
  const next = simulate(config);
  close(next[0].cost.total, before);
  close(next[2].cost.total, 0.28);
});

test("来源表按 key 对齐自定义来源，多个图表和 CSV 包含全部方案", () => {
  const config = small();
  config.plans.push(createPlan({ source: config.plans[1], name: "第三方案", color: planColors[2] }));
  config.plans.forEach((p, i) => {
    p.useGlobal.turnTotalCount = false;
    p.simulation.turnTotalCount = i + 1;
    p.simulation.flow = { initial: [], turn: [{ type: "llm", text: `独有来源${i}`, token: i + 1 }] };
  });
  const results = simulate(config);
  const rows = compareSources(results, 2);
  assert.deepEqual(rows.find(row => row.key === "独有来源0").costs.slice(1), [0, 0]);
  const third = rows.find(row => row.key === "独有来源2");
  assert.equal(third.output, 9);
  close(third.costs[2], results[2].cost.total);
  const source = sourceOption(results, "$");
  assert.deepEqual(source.yAxis.data, config.plans.map(p => p.name));
  for (let i = 0; i < results.length; i++) close(source.series.reduce((sum, series) => sum + series.data[i], 0), results[i].cost.total);
  const trend = trendOption(results, "context", "$");
  assert.deepEqual(trend.series.map(s => s.name), config.plans.map(p => p.name));
  assert.equal(trend.xAxis.max, 3);
  for (const kind of ["requests", "sources"]) {
    const csv = buildCsv(results, config, kind);
    config.plans.forEach(p => assert.ok(csv.includes(`"${p.name}","K","USD"`)));
    assert.ok(!csv.includes("undefined"));
  }
});

test("v4 配置往返保留方案、基准及自定义价格；旧 v2 导入迁移成两方案", () => {
  const config = small();
  config.plans[0].name = "我的按需方案";
  config.plans[0].model.outputPrice = 1.234;
  config.baselineId = config.plans[0].id;
  const imported = readComparisonConfig(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(imported, config);
  assert.deepEqual(simulate(imported), simulate(config));
  const legacy = createConfig();
  legacy.version = 2;
  delete legacy.simulation.flow;
  legacy.model.outputPrice = 123;
  const migrated = readComparisonConfig(legacy);
  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.plans.map(p => p.model.outputPrice), [123, 123]);
  assert.equal(migrated.plans[0].simulation.turnTotalCount, legacy.simulation.turnTotalCount);
});

test("单方案与空方案均能保存、计算，改变基准不改变实际成本", () => {
  const config = small();
  const results = simulate(config);
  config.baselineId = config.plans[0].id;
  assert.deepEqual(simulate(config), results);
  config.plans.pop();
  const single = simulate(config);
  assert.equal(single.length, 1);
  assert.equal(sourceOption(single, "$").yAxis.data.length, 1);
  assert.equal(trendOption(single, "cost", "$").series.length, 1);
  assert.deepEqual(readComparisonConfig(config), config);
  config.plans = [];
  config.baselineId = null;
  assert.deepEqual(simulate(config), []);
  assert.deepEqual(readComparisonConfig(config), config);
});

test("复制方案后修改嵌套流程和费率不影响原方案", () => {
  const config = small();
  const original = config.plans[0];
  const copy = createPlan({ source: original, name: "副本" });
  assert.notEqual(copy.id, original.id);
  copy.simulation.flow.turn.reverse();
  copy.simulation.initialContext.agentPromptToken = 500;
  copy.model.outputPrice = 500;
  assert.equal(original.simulation.flow.turn[0].text, "user_message");
  assert.notEqual(original.simulation.initialContext.agentPromptToken, 500);
  assert.notEqual(original.model.outputPrice, 500);
});

test("多方案校验拒绝重复标识、名称、混合币种、无效基准与数量超限", () => {
  for (const mutate of [
    c => c.plans[1].id = c.plans[0].id,
    c => c.plans[1].name = ` ${c.plans[0].name} `,
    c => c.plans[1].name = " ",
    c => c.plans[1].toolsMode = "invalid",
    c => c.plans[1].model.currency = "EUR",
    c => c.plans[1].color = "invalid",
    c => c.plans[1].simulation.userMessageToken = -1,
    c => c.baselineId = "missing",
    c => c.baselineMode = "invalid",
    c => { c.plans = []; },
    c => { c.plans = Array.from({ length: maxPlans + 1 }, (_, i) => createPlan({ name: `方案${i}` })); },
  ]) {
    const config = small();
    mutate(config);
    assert.ok(Object.keys(validateComparison(config)).length > 0);
    assert.throws(() => simulate(config));
    assert.throws(() => readComparisonConfig(config));
  }
});

test("八方案比较的输入、输出、来源费用与各自请求记录守恒", () => {
  const config = small();
  while (config.plans.length < maxPlans) config.plans.push(createPlan({ source: config.plans[0], name: `方案${config.plans.length + 1}` }));
  const results = simulate(config);
  assert.equal(results.length, maxPlans);
  for (const result of results) {
    close(result.requests.reduce((sum, r) => sum + r.cost.total, 0), result.cost.total);
    close(result.sources.reduce((sum, s) => sum + s.cost.total, 0), result.cost.total);
    for (const key of ["hit", "miss", "output"]) close(result.requests.reduce((sum, r) => sum + r[key], 0), result[key]);
  }
});

// 模拟旧版导出的通用流程：同一流程通过模式条件选择不同步骤。
function legacyFixture(version = 3) {
  const base = createConfig();
  base.simulation.turnTotalCount = 10;
  base.simulation.skillsTotalCount = 1;
  const flow = base.simulation.flow;
  flow.initial.splice(3, 0, { type: "action", text: "tools schema list", token: ["toolsTotalCount", "toolSchemaToken"], toolsMode: "FULL_TOOLS_SCHEMA" });
  flow.turn[3].toolsMode = "LAZY_TOOLS_SCHEMA";
  flow.turn[4].toolsMode = "LAZY_TOOLS_SCHEMA";
  if (version === 2) return { ...base, version: 2 };
  const plans = ["LAZY_TOOLS_SCHEMA", "FULL_TOOLS_SCHEMA"].map((toolsMode, i) => ({
    ...createPlan({ source: base, id: `legacy-${i}`, name: `旧方案 ${i}`, color: planColors[i] }), toolsMode,
  }));
  return { version: 3, unit: "K", baselineId: plans[1].id, plans };
}

test("旧 v2 / v3 条件流程导入为显式步骤，保留基准费用与请求数", () => {
  for (const version of [2, 3]) {
    const original = legacyFixture(version);
    const snapshot = structuredClone(original);
    const migrated = readComparisonConfig(original);
    assert.deepEqual(original, snapshot);
    assert.equal(migrated.version, 4);
    assert.ok(!JSON.stringify(migrated).includes("toolsMode"));
    const results = simulate(migrated);
    assert.deepEqual(results.map(r => r.requests.length), [41, 31]);
    close(results[0].cost.total, 6.12874995);
    close(results[1].cost.total, 8.18847795);
    assert.deepEqual(readComparisonConfig(migrated), migrated);
    if (version === 3) assert.equal(migrated.baselineId, original.baselineId);
  }
});

test("旧 v3 自定义、停用、空阶段与缺省阶段迁移不会补入错误步骤", () => {
  const old = legacyFixture();
  old.plans[0].simulation.flow = { initial: [], turn: [
    { type: "llm", text: "生成", token: 2 },
    { type: "llm", text: "禁用", token: 999, enabled: false },
    { type: "llm", text: "另一模式", token: 999, toolsMode: "FULL_TOOLS_SCHEMA" },
  ] };
  old.plans[1].simulation.flow = { turn: [] };
  old.plans.forEach(plan => plan.simulation.turnTotalCount = 1);
  const migrated = readComparisonConfig(old);
  assert.deepEqual(migrated.plans[0].simulation.flow.initial, []);
  assert.equal(migrated.plans[0].simulation.flow.turn.length, 2);
  assert.ok(migrated.plans[1].simulation.flow.initial.some(step => step.text === "tools schema list"));
  const results = simulate(migrated);
  assert.deepEqual(results.map(r => r.requests.length), [1, 0]);
  assert.equal(results[0].output, 2);
  assert.equal(results[1].cost.total, 0);
  assert.ok(!JSON.stringify(migrated).includes("toolsMode"));
});

test("旧模式配置在导入时验证，新配置拒绝模式条件", () => {
  for (const mutate of [
    c => c.plans[0].toolsMode = "unknown",
    c => c.plans[0].simulation.flow.turn[0].toolsMode = "unknown",
    c => c.plans[0].simulation.flow = null,
  ]) {
    const old = legacyFixture();
    mutate(old);
    assert.throws(() => readComparisonConfig(old));
  }
  const config = small();
  config.plans[0].simulation.flow.turn[0].toolsMode = "LAZY_TOOLS_SCHEMA";
  assert.throws(() => readComparisonConfig(config), /不支持字段/);
  assert.throws(() => simulate(config), /不支持字段/);
});


test("全局轮次和 Tools 驱动模拟，独立覆盖与恢复继承按字段生效", () => {
  const config = small();
  config.globalSimulation.toolsTotalCount = 120;
  const initial = simulate(config);
  assert.deepEqual(initial.map(r => r.rounds.length), [3, 3]);
  const plan = config.plans[1];
  plan.useGlobal.turnTotalCount = false;
  plan.simulation.turnTotalCount = 2;
  plan.useGlobal.toolsTotalCount = false;
  plan.simulation.toolsTotalCount = 20;
  const overridden = simulate(config);
  config.globalSimulation.turnTotalCount = 5;
  config.globalSimulation.toolsTotalCount = 180;
  const updated = simulate(config);
  assert.deepEqual(updated.map(r => r.rounds.length), [5, 2]);
  assert.deepEqual(updated[1], overridden[1]);
  assert.ok(updated[0].initialContext > initial[0].initialContext);
  plan.useGlobal.toolsTotalCount = true;
  assert.ok(simulate(config)[1].initialContext > overridden[1].initialContext);
  plan.useGlobal.turnTotalCount = true;
  assert.deepEqual(simulate(config).map(r => r.rounds.length), [5, 5]);
  const imported = readComparisonConfig(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(imported, config);
  assert.deepEqual(simulate(imported), simulate(config));
  const copy = createPlan({ source: plan, name: "继承副本" });
  copy.useGlobal.turnTotalCount = false;
  assert.equal(plan.useGlobal.turnTotalCount, true);
});

test("旧 v4 导入保持不同轮次和 Tools 数量，不被全局值覆盖", () => {
  const old = small();
  delete old.globalSimulation;
  old.plans.forEach((p, i) => {
    delete p.useGlobal;
    p.simulation.turnTotalCount = i + 2;
    p.simulation.toolsTotalCount = 30 + i * 20;
  });
  const imported = readComparisonConfig(old);
  assert.deepEqual(simulate(imported), simulate(old));
  imported.globalSimulation.turnTotalCount = 9;
  imported.globalSimulation.toolsTotalCount = 200;
  assert.deepEqual(simulate(imported), simulate(old));
});

test("全局值、继承设置与跨字段约束均校验实际生效参数", () => {
  for (const mutate of [
    c => c.globalSimulation.turnTotalCount = 0,
    c => c.globalSimulation.turnTotalCount = 1001,
    c => c.globalSimulation.toolsTotalCount = 1.5,
    c => c.globalSimulation.toolsTotalCount = -1,
    c => c.globalSimulation.toolsTotalCount = "",
    c => c.globalSimulation.toolsTotalCount = 1,
    c => c.globalSimulation = null,
    c => c.plans[0].useGlobal.turnTotalCount = "true",
  ]) {
    const config = small();
    mutate(config);
    assert.ok(Object.keys(validateComparison(config)).length);
    assert.throws(() => simulate(config));
    assert.throws(() => readComparisonConfig(config));
  }
  const config = small();
  config.plans[0].simulation.toolsTotalCount = 1;
  assert.deepEqual(validateComparison(config), {});
  assert.deepEqual(readComparisonConfig(config), config);
  config.plans[0].useGlobal.toolsTotalCount = false;
  assert.ok(validateComparison(config)["plans.0.turnAvgToolsCount"]);
});


test("新增全局 Skills、命中率和压缩设置参与计算，覆盖后不随全局改变", () => {
  const config = small();
  Object.assign(config.globalSimulation, { turnTotalCount: 8, skillsTotalCount: 40, expectedPrefixCacheHitRate: 0.4, compressionThresholdTurnCount: 4 });
  const plan = config.plans[1];
  for (const key of ["skillsTotalCount", "expectedPrefixCacheHitRate", "compressionThresholdType", "compressionThresholdTurnCount", "compressionThresholdToken"]) plan.useGlobal[key] = false;
  Object.assign(plan.simulation, { skillsTotalCount: 10, expectedPrefixCacheHitRate: 0.8, compressionThresholdType: "TURN", compressionThresholdTurnCount: 6 });
  const before = simulate(config);
  assert.equal(before[0].expectedPrefixCacheHitRate, 0.4);
  assert.equal(before[1].expectedPrefixCacheHitRate, 0.8);
  assert.deepEqual(before[0].compressions.map(c => c.round), [4, 6, 8]);
  Object.assign(config.globalSimulation, { skillsTotalCount: 80, expectedPrefixCacheHitRate: 0, compressionThresholdType: "TOKEN", compressionThresholdToken: 9999 });
  const after = simulate(config);
  assert.ok(after[0].initialContext > before[0].initialContext);
  assert.equal(after[0].compressions.length, 0);
  assert.equal(after[0].expectedPrefixCacheHitRate, 0);
  assert.deepEqual(after[1], before[1]);
  const imported = readComparisonConfig(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(imported, config);
  assert.deepEqual(simulate(imported), after);
  for (const key of globalKeys) plan.useGlobal[key] = true;
  const inherited = resolvePlan(plan, config.globalSimulation).simulation;
  for (const key of globalKeys) assert.equal(inherited[key], config.globalSimulation[key]);
  assert.equal(simulate(config)[1].compressions.length, 0);
});

test("仅含轮次和 Tools 的旧全局配置可导入，新增字段保持原方案值", () => {
  const old = small();
  const addedKeys = globalKeys.filter(key => !["turnTotalCount", "toolsTotalCount"].includes(key));
  for (const key of addedKeys) {
    delete old.globalSimulation[key];
    for (const plan of old.plans) delete plan.useGlobal[key];
  }
  Object.assign(old.plans[1].simulation, { skillsTotalCount: 50, expectedPrefixCacheHitRate: 0.55, compressionThresholdType: "TOKEN", compressionThresholdToken: 15 });
  const imported = readComparisonConfig(old);
  const before = simulate(imported);
  for (const key of addedKeys) assert.equal(resolvePlan(imported.plans[1], imported.globalSimulation).simulation[key], old.plans[1].simulation[key]);
  Object.assign(imported.globalSimulation, { skillsTotalCount: 900, expectedPrefixCacheHitRate: 0.1, compressionThresholdType: "TOKEN", compressionThresholdToken: 1000 });
  assert.deepEqual(simulate(imported), before);
  assert.deepEqual(readComparisonConfig(imported), imported);
  assert.equal(old.globalSimulation.skillsTotalCount, undefined);
});

test("新增全局字段校验范围、整数和方案保留轮次，触发方式与阈值可分别覆盖", () => {
  for (const mutate of [
    c => c.globalSimulation.skillsTotalCount = -1,
    c => c.globalSimulation.skillsTotalCount = 2.5,
    c => c.globalSimulation.expectedPrefixCacheHitRate = 90,
    c => c.globalSimulation.expectedPrefixCacheHitRate = -0.1,
    c => c.globalSimulation.compressionThresholdType = "UNKNOWN",
    c => c.globalSimulation.compressionThresholdTurnCount = 2,
    c => c.globalSimulation.compressionThresholdTurnCount = 3.5,
    c => Object.assign(c.globalSimulation, { compressionThresholdType: "TOKEN", compressionThresholdToken: 0 }),
  ]) {
    const config = small(); mutate(config);
    assert.throws(() => simulate(config));
    assert.throws(() => readComparisonConfig(config));
  }
  const config = small();
  const plan = config.plans[0];
  plan.useGlobal.compressionThresholdType = false;
  plan.simulation.compressionThresholdType = "TOKEN";
  config.globalSimulation.compressionThresholdToken = 20.5;
  assert.equal(resolvePlan(plan, config.globalSimulation).simulation.compressionThresholdToken, 20.5);
  assert.deepEqual(validateComparison(config), {});
  plan.useGlobal.compressionThresholdToken = false;
  plan.simulation.compressionThresholdToken = 12.5;
  assert.equal(resolvePlan(plan, config.globalSimulation).simulation.compressionThresholdToken, 12.5);
  assert.deepEqual(readComparisonConfig(config), config);
});

test("全局模型使用内置费率驱动成本，独立方案保留价格，恢复继承和新增方案跟随选择", () => {
  const config = small();
  const preset = modelPresets.find(p => p.actual === "claude-opus-5-5");
  const original = simulate(config);
  const independent = config.plans[1];
  independent.useGlobal.model = false;
  config.globalModelId = preset.id;
  // Inherited plans cannot override preset prices via a stale local snapshot.
  config.plans[0].model.outputPrice = 999;
  const changed = simulate(config);
  assert.deepEqual(changed[0].model, createPresetConfig(preset).model);
  assert.deepEqual(changed[0].pricing, createPresetConfig(preset).pricing);
  assert.notEqual(changed[0].cost.total, original[0].cost.total);
  assert.deepEqual(changed[1], original[1]);
  independent.useGlobal.model = true;
  assert.deepEqual(simulate(config)[1].model, changed[0].model);
  const added = createPlan({ name: "继承全局模型的新方案" });
  config.plans.push(added);
  assert.deepEqual(simulate(config)[2].model, changed[0].model);
  assert.equal(added.model.outputPrice, modelPresets[0].output);
  const imported = readComparisonConfig(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(imported, config);
  assert.deepEqual(simulate(imported), simulate(config));
});

test("旧配置导入保留各方案模型和自定义费率，全局模型仅接受有效预设", () => {
  const old = small();
  delete old.globalModelId;
  old.plans.forEach((p, i) => {
    delete p.useGlobal.model;
    p.model.outputPrice = i + 0.123;
    p.pricing = { id: "custom", label: "手动费率", source: "", date: "" };
  });
  const snapshot = structuredClone(old);
  const before = simulate(old);
  const imported = readComparisonConfig(old);
  assert.deepEqual(old, snapshot);
  imported.globalModelId = modelPresets.at(-1).id;
  assert.ok(imported.plans.every(p => p.useGlobal.model === false));
  assert.deepEqual(simulate(imported), before);
  for (const id of ["custom", "missing", "", null, { outputPrice: 0 }]) {
    const invalid = small();
    invalid.globalModelId = id;
    assert.equal(validateComparison(invalid).globalModelId, "请选择有效的全局模型");
    assert.throws(() => simulate(invalid), /全局模型/);
    assert.throws(() => readComparisonConfig(invalid), /全局模型/);
  }
  const invalid = small();
  invalid.plans[0].useGlobal.model = "true";
  assert.throws(() => readComparisonConfig(invalid), /全局参数/);
});
