import { createDefaultFlow } from "./session-flow.js";

// 页面预设的参数与计算引擎分离，每次创建均返回独立对象。
export function createSessionConfig() {
  return {
    flow: createDefaultFlow(),
    initialContext: {
      agentPromptToken: 4,
    },
    turnTotalCount: 100,
    expectedPrefixCacheHitRate: 0.9,
    skillsTotalCount: 30,
    toolsTotalCount: 90,
    turnAvgSkillsCount: 0.33,
    turnAvgToolsCount: 1.5,
    sessionAvgAllowToolsRate: 0.7,
    skillIndexToken: 0.1,
    toolsIndexToken: 0.013,
    toolSchemaToken: 0.51,
    userMessageToken: 0.1,
    skillDetailToken: 3,
    toolResultToken: 3,
    readSkillPlanToken: 0.1,
    schemaPlanToken: 0.1,
    callToolsPlanToken: 0.3,
    agentResult: 1,
    // TOKEN || TURN
    compressionThresholdType: "TURN",
    compressionThresholdToken: 200,
    compressionThresholdTurnCount: 10,
    compressionTargetToken: 4,
    compressionKeepTurns: 2,
    model: {},
  };
}
