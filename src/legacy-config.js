import { createDefaultFlow, createPreloadedFlow } from "./session-flow.js";

// 旧版条件只在导入边界解析。转换后的方案仅包含独立流程。
const modes = ["LAZY_TOOLS_SCHEMA", "FULL_TOOLS_SCHEMA"];
function migrateSimulation(simulation, mode) {
  if (!simulation || typeof simulation !== "object" || Array.isArray(simulation)) throw new Error("方案缺少模拟参数");
  if (!modes.includes(mode)) throw new Error("旧配置的工具加载方式无效");
  const result = structuredClone(simulation);
  const defaults = mode === modes[0] ? createDefaultFlow() : createPreloadedFlow();
  const flow = result.flow;
  if (flow !== undefined && (!flow || typeof flow !== "object" || Array.isArray(flow))) throw new Error("flow 必须是流程配置对象");
  result.flow = Object.fromEntries(["initial", "turn"].map(phase => {
    const steps = flow?.[phase] === undefined ? defaults[phase] : flow[phase];
    if (!Array.isArray(steps)) throw new Error(`flow.${phase} 必须是步骤数组`);
    return [phase, steps.flatMap(step => {
      if (!step || typeof step !== "object" || Array.isArray(step)) throw new Error("流程步骤必须是对象");
      const { toolsMode, ...plainStep } = step;
      if (toolsMode !== undefined && !modes.includes(toolsMode)) throw new Error("旧流程的 toolsMode 无效");
      return toolsMode === undefined || toolsMode === mode ? [plainStep] : [];
    })];
  }));
  delete result.toolsMode;
  return result;
}

export function migrateLegacyComparison(data) {
  if (data.unit !== "K") throw new Error("仅支持 K Token 配置");
  if (data.version === 2) {
    const plans = modes.map((mode, index) => ({
      id: index ? "plan-full" : "plan-lazy", name: index ? "全量 Tools" : "按需 Tools",
      color: index ? "#d99b61" : "#5869d9", model: data.model, pricing: data.pricing,
      simulation: migrateSimulation(data.simulation, mode),
    }));
    return { version: 4, unit: "K", baselineId: plans[1].id, plans };
  }
  if (!Array.isArray(data.plans)) throw new Error("旧配置缺少方案列表");
  return {
    version: 4, unit: "K", baselineId: data.baselineId,
    plans: data.plans.map(plan => {
      if (!plan || typeof plan !== "object") throw new Error("方案配置无效");
      const { toolsMode, ...result } = plan;
      return { ...result, simulation: migrateSimulation(plan.simulation, toolsMode) };
    }),
  };
}
