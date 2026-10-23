import { createConfig, createPresetConfig, readConfig, validate, groups, compressionFields } from "./config.js";
import { modelPresets } from "./model-pricing.js";
import { createPreloadedFlow } from "./session-flow.js";
import { migrateLegacyComparison } from "./legacy-config.js";

export const planColors = ["#5869d9", "#d99b61", "#449b87", "#9a76c3", "#5c9ebd", "#c77891", "#9b9b4d", "#768397"];
export const maxPlans = 8;
export const globalFields = [
  ...groups[0].fields.filter(([key]) => ["turnTotalCount", "toolsTotalCount", "skillsTotalCount"].includes(key)),
  groups[1].fields[0],
  ...compressionFields.filter(([key]) => ["compressionThresholdTurnCount", "compressionThresholdToken"].includes(key)),
];
export const globalKeys = [...globalFields.map(([key]) => key), "compressionThresholdType"];
export const thresholdKey = simulation => simulation.compressionThresholdType === "TURN" ? "compressionThresholdTurnCount" : "compressionThresholdToken";
export const thresholdField = simulation => {
  const field = globalFields.find(([key]) => key === thresholdKey(simulation));
  return [field[0], "压缩阈值", ...field.slice(2)];
};
export const isGlobalField = key => globalKeys.includes(key);
export function resolvePlan(plan, globalSimulation, globalModelId) {
  if (!plan?.simulation) return plan;
  const simulation = { ...plan.simulation };
  for (const key of globalKeys) if (globalSimulation && plan.useGlobal?.[key]) simulation[key] = globalSimulation[key];
  const preset = plan.useGlobal?.model && modelPresets.find(p => p.id === globalModelId);
  return { ...plan, simulation, ...(preset ? createPresetConfig(preset) : {}) };
}
export function validateGlobals(globalSimulation) {
  const errors = {};
  for (const [key, label, unit, min, max] of globalFields) {
    if (key.startsWith("compressionThreshold") && key !== thresholdKey(globalSimulation || {})) continue;
    const value = globalSimulation?.[key];
    const upper = unit === "%" ? 1 : max;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || (upper !== undefined && value > upper)) errors[key] = unit === "%" ? "请输入 0–100%" : `${label}请输入 ${min}${max ? `–${max}` : " 及以上的有限"}数值`;
    else if (unit !== "%" && unit !== "K" && !Number.isSafeInteger(value)) errors[key] = "请输入整数";
    if (key === "compressionThresholdToken" && value <= 0) errors[key] = "压缩阈值必须大于 0";
  }
  if (!["TURN", "TOKEN"].includes(globalSimulation?.compressionThresholdType)) errors.compressionThresholdType = "请选择压缩阈值类型";
  return errors;
}

export function createPlan({ source, name = "自定义方案", id = crypto.randomUUID(), color = planColors[0] } = {}) {
  const base = source ? structuredClone(source) : createConfig();
  return {
    id, name, color,
    simulation: base.simulation, model: base.model, pricing: base.pricing,
    useGlobal: source ? { ...source.useGlobal } : { ...Object.fromEntries(globalKeys.map(key => [key, true])), model: true },
  };
}

export function createComparisonConfig() {
  const plans = [
    createPlan({ id: "plan-lazy", name: "按需 Tools", color: planColors[0] }),
    createPlan({ id: "plan-full", name: "全量 Tools", color: planColors[1] }),
  ];
  plans[1].simulation.flow = createPreloadedFlow();
  const globalSimulation = Object.fromEntries(globalKeys.map(key => [key, plans[0].simulation[key]]));
  return { version: 4, unit: "K", baselineId: plans[0].id, baselineMode: "auto", globalSimulation, globalModelId: modelPresets[0].id, plans };
}

export function resolveBaselineId(config, results) {
  if (!results.length) return null;
  if (config.baselineMode !== "auto" && results.some(result => result.planId === config.baselineId)) return config.baselineId;
  return results.reduce((best, result) => result.cost.total > best.cost.total ? result : best).planId;
}

export function validatePlan(plan, globalSimulation, globalModelId) {
  if (!plan || typeof plan !== "object" || !plan.simulation || !plan.model) return { plan: "方案缺少参数或模型配置" };
  const errors = validate(resolvePlan(plan, globalSimulation, globalModelId));
  if (plan.useGlobal !== undefined && (!plan.useGlobal || typeof plan.useGlobal !== "object" || Array.isArray(plan.useGlobal) || Object.entries(plan.useGlobal).some(([key, value]) => (!isGlobalField(key) && key !== "model") || typeof value !== "boolean"))) errors.useGlobal = "全局参数设置无效";
  if (typeof plan.id !== "string" || !plan.id.trim()) errors.id = "方案需要唯一标识";
  if (typeof plan.name !== "string" || !plan.name.trim() || plan.name.length > 60) errors.planName = "方案名称需为 1–60 个字符";
  const unknown = Object.keys(plan).find(key => !["id", "name", "color", "simulation", "model", "pricing", "useGlobal"].includes(key));
  if (unknown) errors.plan = `方案不支持字段 ${unknown}`;
  if (!planColors.includes(plan.color)) errors.color = "方案颜色无效";
  return errors;
}

export function validateComparison(config) {
  const errors = {};
  if (config?.version !== 4 || config.unit !== "K") errors.version = "请使用 v4 多方案配置（K Token）";
  if (config?.baselineMode !== undefined && !["auto", "manual"].includes(config.baselineMode)) errors.baselineMode = "Base模式无效";
  if (!Array.isArray(config?.plans) || config.plans.length > maxPlans) return { plans: `最多对比 ${maxPlans} 个方案` };
  if (config.globalSimulation !== undefined) for (const [key, message] of Object.entries(validateGlobals(config.globalSimulation))) errors[`globalSimulation.${key}`] = message;
  if (config.globalModelId !== undefined && !modelPresets.some(p => p.id === config.globalModelId)) errors.globalModelId = "请选择有效的全局模型";
  const ids = new Set(), names = new Set();
  config.plans.forEach((plan, index) => {
    for (const [key, message] of Object.entries(validatePlan(plan, config.globalSimulation, config.globalModelId))) errors[`plans.${index}.${key}`] = `方案 ${index + 1}：${message}`;
    if (!plan || typeof plan !== "object") return;
    if (ids.has(plan.id)) errors[`plans.${index}.id`] = "方案标识不能重复";
    if (typeof plan.name === "string" && names.has(plan.name.trim())) errors[`plans.${index}.planName`] = "方案名称不能重复";
    ids.add(plan.id);
    names.add(plan.name?.trim?.());
    if (plan.model?.currency !== config.plans[0]?.model?.currency) errors.currency = "对比方案需使用相同币种";
  });
  if (config.plans.length ? !ids.has(config.baselineId) : config.baselineId !== null) errors.baselineId = "请选择有效的Base";
  return errors;
}

export function readComparisonConfig(data) {
  if (data?.version === 2 || data?.version === 3) data = migrateLegacyComparison(data);
  if (data?.version !== 4 || data.unit !== "K" || !Array.isArray(data.plans)) throw new Error("仅支持 v4 多方案配置，或导入 v2 / v3 旧配置（K Token）。");
  if (data.plans.length > maxPlans) throw new Error(`最多对比 ${maxPlans} 个方案`);
  // Older exports only shared rounds and tools. Fill new global controls without
  // changing those plans' existing independent settings or their inheritance flags.
  let globalSimulation = data.globalSimulation === undefined ? {} : structuredClone(data.globalSimulation);
  if (globalSimulation && typeof globalSimulation === "object" && !Array.isArray(globalSimulation)) {
    const defaults = createConfig().simulation;
    for (const key of globalKeys) {
      if (data.globalSimulation === undefined || (!["turnTotalCount", "toolsTotalCount"].includes(key) && !Object.hasOwn(globalSimulation, key))) globalSimulation[key] = data.plans[0]?.simulation?.[key] ?? defaults[key];
    }
  }
  const plans = data.plans.map(plan => {
    if (!plan || typeof plan !== "object") throw new Error("方案配置无效");
    const normalized = readConfig({ ...resolvePlan(plan, data.globalSimulation), version: 4, unit: "K" });
    for (const key of globalKeys) normalized.simulation[key] = plan.simulation[key];
    const result = { ...plan, simulation: normalized.simulation, model: normalized.model, pricing: normalized.pricing };
    return result;
  });
  const config = { version: 4, unit: "K", baselineId: data.baselineId, plans };
  config.globalSimulation = globalSimulation;
  config.globalModelId = data.globalModelId === undefined ? modelPresets[0].id : data.globalModelId;
  // Exports predating global models keep each plan's original model and prices.
  if (data.globalModelId === undefined) plans.forEach(plan => { plan.useGlobal = { ...plan.useGlobal, model: false }; });
  if (data.globalSimulation === undefined) plans.forEach(plan => { plan.useGlobal = { ...Object.fromEntries(globalKeys.map(key => [key, false])), model: plan.useGlobal?.model === true }; });
  if (data.baselineMode !== undefined) config.baselineMode = data.baselineMode;
  const errors = validateComparison(config);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return config;
}

// 以来源 key 对齐，独立流程的来源数量与顺序可以不同。
export function compareSources(results, selectedIndex) {
  const sources = new Map();
  results.forEach(result => result.sources.forEach(source => sources.set(source.key, source.name)));
  return [...sources].map(([key, name]) => {
    const values = results.map(result => result.sources.find(source => source.key === key));
    const selected = values[selectedIndex];
    return {
      key, name, hit: selected?.hit ?? 0, miss: selected?.miss ?? 0, output: selected?.output ?? 0,
      costs: values.map(source => source?.cost.total ?? 0), cost: selected?.cost.total ?? 0,
    };
  }).sort((a, b) => Math.max(...b.costs) - Math.max(...a.costs));
}
