import { evaluateFormula } from "./token-formula.js";

// 流程只包含 JSON 数据，可直接经过 Worker 和配置导入导出。
export const tokenParameters = {
  "initialContext.agentPromptToken": "Agent Prompt",
  skillIndexToken: "单个 Skill 索引",
  toolsIndexToken: "单个 Tool 索引",
  toolSchemaToken: "单个 Tool Schema",
  userMessageToken: "用户消息",
  skillDetailToken: "单个 Skill 内容",
  toolResultToken: "单个 Tool Result",
  readSkillPlanToken: "读取技能计划",
  schemaPlanToken: "查询 Schema 计划",
  callToolsPlanToken: "调用工具计划",
  agentResult: "Agent 最终回复",
  turnTotalCount: "会话总轮次",
  skillsTotalCount: "Skills 总数",
  toolsTotalCount: "Tools 总数",
  turnAvgSkillsCount: "每轮平均 Skills",
  turnAvgToolsCount: "每轮平均 Tools",
  sessionAvgAllowToolsRate: "角色允许工具比例",
};

export const runtimeParameters = {
  turnIndex: "当前用户轮次索引（从 0 开始）",
  llmIndex: "当前步骤前已执行的模型调用数",
};

// 预览与校验使用相同计数规则：停用步骤不计数，初始阶段固定为 0。
export function stepRuntime(flow, phase, index, turnIndex = 0) {
  return phase === "initial" ? { turnIndex: 0, llmIndex: 0 } : {
    turnIndex,
    llmIndex: flow.turn.slice(0, index).filter(step => step?.type === "llm" && step.enabled !== false).length,
  };
}

export function createDefaultFlow() {
  return {
    initial: [
      { type: "action", text: "agent prompt", token: "initialContext.agentPromptToken" },
      { type: "action", text: "skills discover list", token: "skillIndexToken * skillsTotalCount" },
      { type: "action", text: "tools discover list", token: "toolsTotalCount * toolsIndexToken" },
      { type: "action", text: "role allow tools", token: "toolsTotalCount * toolsIndexToken * sessionAvgAllowToolsRate" },
    ],
    turn: [
      { type: "action", text: "user_message", token: "userMessageToken" },
      { type: "llm", text: "read_skills_plan", token: "readSkillPlanToken" },
      { type: "action", text: "read_skills", token: "skillDetailToken * turnAvgSkillsCount" },
      { type: "llm", text: "get_tools_schema_plan", token: "schemaPlanToken" },
      { type: "action", text: "get_tools_schema", token: "toolSchemaToken * turnAvgToolsCount" },
      { type: "llm", text: "call_tools_plan", token: "callToolsPlanToken" },
      { type: "action", text: "call_tools", token: "toolResultToken * turnAvgToolsCount" },
      { type: "llm", text: "agent_result", token: "agentResult" },
    ],
  };
}

// 这是另一套可编辑流程模板；引擎无需知道模板名称或工具加载策略。
export function createPreloadedFlow() {
  const flow = createDefaultFlow();
  flow.initial.splice(3, 0, { type: "action", text: "tools schema list", token: "toolsTotalCount * toolSchemaToken" });
  flow.turn.splice(3, 2);
  return flow;
}

export function tokenFormula(token) {
  return Array.isArray(token) ? token.join(" * ") : String(token);
}

export function formulaVariables(config, runtime = {}) {
  return {
    ...Object.fromEntries(Object.keys(tokenParameters).map(path => [path, path.split(".").reduce((parent, key) => parent?.[key], config)])),
    turnIndex: runtime.turnIndex ?? 0,
    llmIndex: runtime.llmIndex ?? 0,
  };
}

export function resolveStepToken(token, config, runtime) {
  if (typeof token === "number") {
    if (Number.isFinite(token) && token >= 0) return token;
    throw new RangeError("Token 必须是非负有限数值");
  }
  if (typeof token === "string") return evaluateFormula(token, formulaVariables(config, runtime));
  // 兼容旧版参数乘积数组；页面编辑后保存为公式字符串。
  const factors = token;
  if (!Array.isArray(factors) || factors.length === 0) {
    throw new TypeError("Token 必须是数值、公式字符串或非空参数名数组");
  }
  const result = factors.reduce((total, path) => {
    if (typeof path !== "string" || !Object.hasOwn(tokenParameters, path)) {
      throw new RangeError(`未知 Token 参数：${String(path)}`);
    }
    const value = path.split(".").reduce((parent, key) => parent?.[key], config);
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${path} 必须是非负有限数值`);
    return total * value;
  }, 1);
  if (!Number.isFinite(result)) throw new RangeError("Token 乘积超出可计算范围");
  return result;
}

export function validateFlow(flow, config) {
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) throw new TypeError("flow 必须是流程配置对象");
  for (const phase of ["initial", "turn"]) {
    const steps = flow[phase];
    if (!Array.isArray(steps)) throw new TypeError(`flow.${phase} 必须是步骤数组`);
    steps.forEach((step, index) => {
      const prefix = `flow.${phase} 第 ${index + 1} 步`;
      if (!step || typeof step !== "object" || Array.isArray(step)) throw new TypeError(`${prefix} 必须是步骤对象`);
      if (!["action", "llm"].includes(step.type) || (phase === "initial" && step.type !== "action")) {
        throw new RangeError(`${prefix} 类型无效；initial 仅支持 action，turn 支持 action / llm`);
      }
      if (typeof step.text !== "string" || !step.text.trim()) throw new TypeError(`${prefix} 需要非空名称`);
      if (step.enabled !== undefined && typeof step.enabled !== "boolean") throw new TypeError(`${prefix} enabled 必须是布尔值`);
      const unknown = Object.keys(step).find(key => !["type", "text", "token", "enabled"].includes(key));
      if (unknown) throw new RangeError(`${prefix} 不支持字段 ${unknown}`);
      try {
        resolveStepToken(step.token, config, stepRuntime(flow, phase, index));
      } catch (error) {
        throw new RangeError(`${prefix}：${error.message}`);
      }
    });
  }
}
