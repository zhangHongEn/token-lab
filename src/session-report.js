import Session, { contentSize } from "./session.js";
import { validateComparison, resolvePlan } from "./comparison.js";

export const sourceNames = {
  "agent prompt": "Agent Prompt", "skills discover list": "Skills 索引",
  "tools discover list": "Tools 索引", "tools schema list": "初始 Tools Schema",
  "role allow tools": "角色允许工具列表", user_message: "用户消息",
  read_skills_plan: "读取技能计划", read_skills: "Skills 内容",
  get_tools_schema_plan: "查询 Schema 计划", get_tools_schema: "按需 Tools Schema",
  call_tools_plan: "调用工具计划", call_tools: "Tools Result", agent_result: "Agent 最终回复",
  "compression retained turns": "压缩保留轮次", "compress history": "压缩摘要",
};
export const ratio = (a, b) => b === 0 ? null : a / b;
const sourceName = key => Object.hasOwn(sourceNames, key) ? sourceNames[key] : key;
export function fees(hit, miss, output, model) {
  const cached = hit / 1000 * model.inputCachedPrice;
  const fresh = miss / 1000 * model.inputNotCachedPrice;
  const generated = output / 1000 * model.outputPrice;
  return { cached, fresh, generated, total: cached + fresh + generated };
}
function prefixSize(llm) {
  let index = 0, size = 0;
  for (const turn of llm.input.turns) {
    for (const action of turn.actions) {
      if (index++ >= llm.notCachedIndex) return size;
      if (action.type !== "llm") size += action.token;
    }
  }
  return size;
}

// Read recorded classifications; never recreate or override the engine's cache logic.
export function buildReport(session) {
  const totals = session.getConsumptionTokens();
  const model = session.config.model;
  const requests = [], rounds = [], compressions = [];
  // 预先收集来源，停用步骤保留为零值来源。
  const sourceKeys = new Set([
    ...Object.keys(sourceNames),
    ...session.config.flow.initial.map(step => step.text),
    ...session.config.flow.turn.map(step => step.text),
  ]);
  const sources = Object.assign(Object.create(null), Object.fromEntries(
    [...sourceKeys].map(key => [key, { key, name: sourceName(key), hit: 0, miss: 0, output: 0 }])
  ));
  const initialContext = contentSize(session.getInitialContext());
  const turnSizes = session.turns.map(turn => contentSize(turn.actions));
  const userNumbers = new Map();
  let activeTurns = [0], context = initialContext, cumulativeCost = 0, cumulativeTokens = 0;
  let round;
  for (const turn of session.turns.slice(1)) {
    const userTurn = turn.kind === "user";
    if (userTurn) {
      userNumbers.set(turn.index, rounds.length + 1);
      round = { round: rounds.length + 1, requestIds: [], cost: 0, cumulativeCost: 0, cumulativeTokens: 0, context: 0, peakInput: 0, beforeCompression: null, compression: null };
      rounds.push(round);
      context += turnSizes[turn.index];
      activeTurns.push(turn.index);
    }
    for (let actionIndex = 0; actionIndex < turn.actions.length; actionIndex++) {
      const llm = turn.actions[actionIndex];
      if (llm.type !== "llm") continue;
      const compression = turn.kind === "compression";
      const cost = fees(llm.cachedToken, llm.notCachedToken, llm.output.token, model);
      cumulativeCost += cost.total;
      cumulativeTokens += llm.cachedToken + llm.notCachedToken + llm.output.token;
      const attribution = Object.entries(llm.actionGroupTokens).map(([key, tokens]) => ({ key, hit: tokens.cachedToken, miss: tokens.notCachedToken, output: 0 }));
      let outputSource = attribution.find(s => s.key === llm.output.group);
      if (!outputSource) { outputSource = { key: llm.output.group, hit: 0, miss: 0, output: 0 }; attribution.push(outputSource); }
      outputSource.output += llm.output.token;
      for (const source of attribution) {
        sources[source.key] ??= { key: source.key, name: sourceName(source.key), hit: 0, miss: 0, output: 0 };
        for (const key of ["hit", "miss", "output"]) sources[source.key][key] += source[key];
        source.name = sources[source.key].name;
        source.cost = fees(source.hit, source.miss, source.output, model);
      }
      // 连续追加的内容都属于这次请求之后的结果，直到下一次模型调用。
      let toolResult = 0;
      for (let i = actionIndex + 2; i < turn.actions.length && turn.actions[i].type !== "llm"; i++) {
        toolResult += turn.actions[i].token;
      }
      const request = {
        id: requests.length + 1, round: round.round, compression,
        stage: compression ? "上下文压缩" : sourceName(llm.output.group),
        input: llm.cachedToken + llm.notCachedToken, prefix: prefixSize(llm),
        hit: llm.cachedToken, miss: llm.notCachedToken, output: llm.output.token,
        toolResult,
        cost, cumulativeCost, attribution,
      };
      requests.push(request);
      round.requestIds.push(request.id);
      round.cost += cost.total;
      round.peakInput = Math.max(round.peakInput || 0, request.input);
      if (compression) {
        const [start, end] = session.compressedRanges[compressions.length];
        const compressedRounds = activeTurns.filter(i => i >= start && i <= end && userNumbers.has(i)).map(i => userNumbers.get(i));
        const before = context;
        activeTurns = activeTurns.filter(i => i < start || i > end);
        const keptRounds = activeTurns.filter(i => userNumbers.has(i)).map(i => userNumbers.get(i));
        activeTurns.push(turn.index);
        context = activeTurns.reduce((sum, i) => sum + turnSizes[i], 0);
        const event = { round: round.round, requestId: request.id, before, after: context, compressedRounds, keptRounds, cost: cost.total, summary: llm.output.token };
        compressions.push(event);
        round.beforeCompression = before;
        round.compression = event;
      }
    }
    round.cumulativeCost = cumulativeCost;
    round.cumulativeTokens = cumulativeTokens;
    round.context = context;
  }
  const result = {
    initialContext,
    finalContext: contentSize(session.getContextSnapshot().turns.flatMap(t => t.actions)),
    peakInput: requests.reduce((peak, request) => Math.max(peak, request.input), 0),
    hit: totals.totalInputCached, miss: totals.totalInputNotCached, output: totals.totalOutput,
    cost: { cached: totals.totalInputCachedPrice, fresh: totals.totalInputNotCachedPrice, generated: totals.totalOutputPrice, total: totals.totalPrice },
    hitRate: ratio(totals.totalInputCached, totals.totalInputCached + totals.totalInputNotCached),
    equivalent: model.inputNotCachedPrice === 0 ? null : totals.totalInputCached * model.inputCachedPrice / model.inputNotCachedPrice,
    compressionCost: compressions.reduce((sum, c) => sum + c.cost, 0),
    averageUserTurnsPerCompression: totals.averageUserTurnsPerCompression,
    requests, rounds, compressions,
    sources: Object.values(sources).map(s => ({ ...s, cost: fees(s.hit, s.miss, s.output, model) })),
  };
  if ([result.hit, result.miss, result.output, result.finalContext, result.peakInput, result.cost.total].some(n => !Number.isFinite(n))) throw new Error("数值超出可计算范围，请减小参数。");
  return result;
}
export function simulate(config) {
  const errors = validateComparison(config);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return config.plans.map(plan => {
    plan = resolvePlan(plan, config.globalSimulation, config.globalModelId);
    const session = new Session({ ...plan.simulation, model: plan.model });
    session.reset();
    return {
      ...buildReport(session), planId: plan.id, planName: plan.name, color: plan.color,
      model: { ...plan.model }, pricing: structuredClone(plan.pricing),
      expectedPrefixCacheHitRate: plan.simulation.expectedPrefixCacheHitRate,
    };
  });
}
