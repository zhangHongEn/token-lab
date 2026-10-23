import test from "node:test";
import assert from "node:assert/strict";
import { modelPresets, bailianPresets, deepseekPresets, overseasPresets, bailianData, modelPricingData } from "./model-pricing.js";
import { createConfig, createPresetConfig, readConfig, validate } from "./config.js";
import { createComparisonConfig, readComparisonConfig, validateComparison } from "./comparison.js";
import { simulate } from "./session-report.js";
import { buildCsv } from "./export.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("全部费率数据及预设直接使用美元，固定、分档、分时及显式缓存保留原值", () => {
  assert.equal(new Set(modelPresets.map(p => p.id)).size, modelPresets.length);
  for (const preset of modelPresets) {
    assert.equal(preset.currency, "USD");
    assert.deepEqual(validate({ ...createConfig(), ...createPresetConfig(preset) }), {});
  }
  assert.equal(bailianData.models[0].prices.input, 12);
  const first = bailianPresets[0];
  close(first.miss, 12);
  close(first.hit, 1.5);
  close(first.output, 36);
  close(first.explicitCacheCreate, 15);
  close(first.explicitCacheHit, 1);
  close(bailianPresets.find(p => p.id === "bailian:qwen3.7-plus:tier-2").miss, 6);
  close(deepseekPresets.find(p => p.id === "flash-peak").output, 8);
  assert.ok(modelPricingData.every(provider => provider.currency === "USD"));
});

test("海外模型保留官方美元价格、来源、分档及优惠说明", () => {
  for (const [id, prices] of [
    ["openai:gpt-6.1-sol:tier-1", [0.1, 2, 10]],
    ["openai:gpt-6.1-sol:tier-2", [0.2, 4, 15]],
    ["anthropic:claude-opus-5-5:fixed", [0.2, 4, 20]],
    ["anthropic:claude-haiku-5-5:tier-2", [0.05, 0.5, 2.5]],
    ["google:gemini-3.8-flash:fixed", [0.075, 0.75, 3.75]],
  ]) {
    const preset = overseasPresets.find(p => p.id === id);
    assert.deepEqual([preset.hit, preset.miss, preset.output], prices);
    assert.match(preset.source, /^https:\/\//);
    const config = { ...createConfig(), ...createPresetConfig(preset) };
    assert.deepEqual(readConfig(JSON.parse(JSON.stringify(config))), config);
    assert.ok(config.pricing.note);
  }
  assert.match(overseasPresets.find(p => p.actual === "gemini-4-argon").pricingNote, /2026-11-30/);
});

test("美元配置导入保留实际单价，导入导出不修改费率数值", () => {
  for (const currency of ["$", "USD"]) {
    const config = createConfig();
    config.model = { name: "自定义模型", currency, inputCachedPrice: 0, inputNotCachedPrice: 7, outputPrice: 14 };
    delete config.pricing;
    const snapshot = structuredClone(config);
    const imported = readConfig(config);
    assert.deepEqual(config, snapshot);
    assert.deepEqual(imported.model, { ...config.model, currency: "$" });
    assert.deepEqual(readConfig(imported), imported);
    config.model.inputNotCachedPrice = "7";
    assert.throws(() => readConfig(config), /单价/);
  }
  const old = createConfig();
  old.version = 2;
  old.model.outputPrice = 14;
  assert.ok(readComparisonConfig(old).plans.every(p => p.model.currency === "$" && p.model.outputPrice === 14));
});

test("国内、海外模型可直接比较，导入与 CSV 均为 USD，费用守恒", () => {
  const config = createComparisonConfig();
  Object.assign(config.plans[0], createPresetConfig(bailianPresets[0]));
  Object.assign(config.plans[1], createPresetConfig(overseasPresets.find(p => p.actual === "claude-opus-5-5")));
  for (const plan of config.plans) {
    plan.useGlobal.model = false;
    plan.useGlobal.turnTotalCount = false;
    plan.simulation.turnTotalCount = 1;
    plan.simulation.flow = { initial: [{ type: "action", text: "输入", token: 1 }], turn: [{ type: "llm", text: "输出", token: 1 }] };
    plan.useGlobal.expectedPrefixCacheHitRate = false;
    plan.simulation.expectedPrefixCacheHitRate = 0;
  }
  assert.deepEqual(validateComparison(config), {});
  const results = simulate(config);
  close(results[0].cost.total, (12 + 36) / 1000);
  close(results[1].cost.total, (4 + 20) / 1000);
  for (const kind of ["sources", "requests"]) {
    const csv = buildCsv(results, config, kind);
    assert.ok(csv.includes('"K","USD"'));
  }
  config.plans[0].model.outputPrice = 14;
  const imported = readComparisonConfig(config);
  assert.deepEqual(validateComparison(imported), {});
  assert.equal(imported.plans[0].model.outputPrice, 14);
  assert.deepEqual(imported.plans[1].model, config.plans[1].model);
});
