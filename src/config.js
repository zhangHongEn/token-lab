import { createSessionConfig } from "./session-defaults.js";
import { modelPresets } from "./model-pricing.js";
import { validateFlow } from "./session-flow.js";

export const groups = [
  { title: "会话规模", fields: [
    ["turnTotalCount", "用户轮次", "轮", 1, 1000],
    ["skillsTotalCount", "Skills 总数", "个", 0],
    ["toolsTotalCount", "Tools 总数", "个", 0],
    ["turnAvgSkillsCount", "每轮平均 Skills", "个", 0],
    ["turnAvgToolsCount", "每轮平均 Tools", "个", 0],
  ] },
  { title: "缓存与权限", fields: [
    ["expectedPrefixCacheHitRate", "Prefix 命中率", "%", 0, 100, "虽然prefix相同, 但缓存过期等多种场景会无法命中"],
    ["sessionAvgAllowToolsRate", "角色允许工具比例", "%", 0, 100],
  ] },
  { title: "初始上下文", fields: [
    ["initialContext.agentPromptToken", "Agent Prompt", "K", 0],
    ["skillIndexToken", "单个 Skill 索引", "K", 0],
    ["toolsIndexToken", "单个 Tool 索引", "K", 0],
    ["toolSchemaToken", "单个 Tool Schema", "K", 0],
  ] },
  { title: "每轮内容与输出", fields: [
    ["userMessageToken", "用户消息", "K", 0],
    ["skillDetailToken", "单个 Skill 内容", "K", 0],
    ["toolResultToken", "单个 Tool Result", "K", 0],
    ["readSkillPlanToken", "读取技能计划", "K", 0],
    ["schemaPlanToken", "查询 Schema 计划", "K", 0],
    ["callToolsPlanToken", "调用工具计划", "K", 0],
    ["agentResult", "Agent 最终回复", "K", 0],
  ] },
];
export const compressionFields = [
  ["compressionThresholdTurnCount", "活跃用户轮次阈值", "轮", 1],
  ["compressionThresholdToken", "上下文触发阈值", "K", 0],
  ["compressionKeepTurns", "保留最近用户轮次", "轮", 0],
  ["compressionTargetToken", "压缩摘要长度", "K", 0],
];
const fields = [...groups.flatMap(g => g.fields), ...compressionFields];
const integers = new Set(["turnTotalCount", "skillsTotalCount", "toolsTotalCount", "compressionThresholdTurnCount", "compressionKeepTurns"]);
export const priceFields = [["inputCachedPrice", "命中输入"], ["inputNotCachedPrice", "未命中输入"], ["outputPrice", "模型输出"]];
export const getValue = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
export function setValue(object, path, value) {
  const keys = path.split(".");
  const key = keys.pop();
  keys.reduce((parent, part) => parent[part], object)[key] = value;
}
export function createConfig() {
  const { model, ...simulation } = createSessionConfig();
  return { version: 4, unit: "K", simulation, ...createPresetConfig(modelPresets[0]) };
}
export function createPresetConfig(preset) {
  return {
    model: { name: preset.name, currency: "$", inputCachedPrice: preset.hit, inputNotCachedPrice: preset.miss, outputPrice: preset.output },
    pricing: { id: preset.id, label: preset.sourceLabel || "内置费率快照", source: preset.source, date: preset.verified, note: preset.pricingNote || "", ...(preset.contextWindow ? { contextWindow: preset.contextWindow } : {}), ...(preset.tier ? { tier: { input_tokens_gt: preset.tier.input_tokens_gt, input_tokens_lte: preset.tier.input_tokens_lte } } : {}) },
  };
}
export function validate(config) {
  const errors = {};
  const s = config.simulation;
  for (const [key, , unit, min, max] of fields) {
    if (key === "compressionThresholdTurnCount" && s.compressionThresholdType !== "TURN") continue;
    if (key === "compressionThresholdToken" && s.compressionThresholdType !== "TOKEN") continue;
    const value = getValue(s, key);
    const upper = unit === "%" ? 1 : max;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || (upper !== undefined && value > upper)) {
      errors[key] = unit === "%" ? "请输入 0–100%" : `请输入 ${min}${max ? `–${max}` : " 及以上的有限"}数值`;
    } else if (integers.has(key) && !Number.isInteger(value)) errors[key] = "请输入整数";
  }
  if (s.turnAvgSkillsCount > s.skillsTotalCount) errors.turnAvgSkillsCount = "不能超过 Skills 总数";
  if (s.turnAvgToolsCount > s.toolsTotalCount) errors.turnAvgToolsCount = "不能超过 Tools 总数";
  if (!["TURN", "TOKEN"].includes(s.compressionThresholdType)) errors.compressionThresholdType = "请选择压缩阈值类型";
  if (s.compressionThresholdType === "TURN" && s.compressionThresholdTurnCount <= s.compressionKeepTurns) errors.compressionThresholdTurnCount = "阈值必须大于保留轮次";
  if (s.compressionThresholdType === "TOKEN" && s.compressionThresholdToken <= 0) errors.compressionThresholdToken = "阈值必须大于 0";
  try { validateFlow(s.flow, s); } catch (error) { errors.flow = error.message; }
  for (const [key] of priceFields) {
    if (typeof config.model[key] !== "number" || !Number.isFinite(config.model[key]) || config.model[key] < 0) errors[key] = "请输入非负有限单价";
  }
  if (config.model.currency !== "$") errors.currency = "模型费率请统一使用美元（$）";
  if (typeof config.model.name !== "string" || !config.model.name.trim()) errors.name = "请输入模型名称";
  return errors;
}
export function readConfig(data) {
  if (data?.version !== 4 || data.unit !== "K" || !data.simulation || !data.model) throw new Error("仅支持 Session v4 配置（K Token）。");
  const normalized = createConfig();
  for (const [key] of fields) {
    const value = getValue(data.simulation, key);
    if (value === undefined) throw new Error(`配置缺少 ${key}`);
    setValue(normalized.simulation, key, value);
  }
  normalized.simulation.compressionThresholdType = data.simulation.compressionThresholdType;
  if (data.simulation.flow !== undefined) {
    const flow = data.simulation.flow;
    if (!flow || typeof flow !== "object" || Array.isArray(flow)) throw new Error("flow 必须是流程配置对象");
    normalized.simulation.flow = { ...normalized.simulation.flow, ...structuredClone(flow) };
  }
  for (const key of ["name", "currency", ...priceFields.map(([key]) => key)]) normalized.model[key] = data.model[key];
  normalized.pricing = { id: "custom", label: "手动费率", source: "", date: "" };
  if (data.pricing && typeof data.pricing === "object") {
    for (const key of ["id", "label", "source", "date", "note"]) {
      if (typeof data.pricing[key] === "string") normalized.pricing[key] = data.pricing[key];
    }
    if (Number.isFinite(data.pricing.contextWindow) && data.pricing.contextWindow > 0) normalized.pricing.contextWindow = data.pricing.contextWindow;
    const tier = data.pricing.tier;
    if (tier && Number.isFinite(tier.input_tokens_gt) && Number.isFinite(tier.input_tokens_lte) && tier.input_tokens_gt >= 0 && tier.input_tokens_lte > tier.input_tokens_gt) normalized.pricing.tier = { input_tokens_gt: tier.input_tokens_gt, input_tokens_lte: tier.input_tokens_lte };
  }
  if (normalized.model.currency === "USD") normalized.model.currency = "$";
  const errors = validate(normalized);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return normalized;
}
