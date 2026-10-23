import { createSessionConfig } from "./session-defaults.js";
import { resolveStepToken, validateFlow } from "./session-flow.js";

export const contentSize = actions => actions.reduce((sum, action) => sum + (action.type === "llm" ? 0 : action.token), 0);
const flatten = snapshot => snapshot.turns.flatMap(turn => turn.actions);
const priceKeys = ["inputCachedPrice", "inputNotCachedPrice", "outputPrice"];

export default class Session {
  constructor(config = {}) {
    const defaults = createSessionConfig();
    this.config = {
      ...defaults,
      ...config,
      initialContext: { ...defaults.initialContext, ...config.initialContext },
      model: { ...config.model },
      flow: config.flow === undefined ? defaults.flow : config.flow,
    };
    if (this.config.flow && typeof this.config.flow === "object" && !Array.isArray(this.config.flow)) {
      this.config.flow = { ...defaults.flow, ...this.config.flow };
    }
    this.config.flow = structuredClone(this.config.flow);
    this.initialize();
  }

  validateConfig() {
    const c = this.config;
    validateFlow(c.flow, c);
    if (!Number.isInteger(c.turnTotalCount) || c.turnTotalCount < 0) throw new RangeError("turnTotalCount 必须是非负整数");
    if (!Number.isFinite(c.expectedPrefixCacheHitRate) || c.expectedPrefixCacheHitRate < 0 || c.expectedPrefixCacheHitRate > 1) {
      throw new RangeError("expectedPrefixCacheHitRate 必须在 0–1 之间");
    }
    if (!["TURN", "TOKEN"].includes(c.compressionThresholdType)) throw new RangeError("compressionThresholdType 必须是 TURN 或 TOKEN");
    if (!Number.isInteger(c.compressionKeepTurns) || c.compressionKeepTurns < 0) throw new RangeError("compressionKeepTurns 必须是非负整数");
    if (c.compressionThresholdType === "TURN" && (!Number.isInteger(c.compressionThresholdTurnCount) || c.compressionThresholdTurnCount <= c.compressionKeepTurns)) {
      throw new RangeError("compressionThresholdTurnCount 必须是大于 compressionKeepTurns 的正整数");
    }
    if (c.compressionThresholdType === "TOKEN" && (!Number.isFinite(c.compressionThresholdToken) || c.compressionThresholdToken <= 0)) {
      throw new RangeError("compressionThresholdToken 必须是有限正数");
    }
    if (!Number.isFinite(c.compressionTargetToken) || c.compressionTargetToken < 0) throw new RangeError("compressionTargetToken 必须是有限非负数");
  }

  initialize() {
    this.validateConfig();
    this.turns = [];
    this.compressedRanges = [];
    this.actionIndex = 0;
    this.userTurnCount = 0;
    this.initialContext = this.config.flow.initial
      .filter(step => step.enabled !== false)
      .map(step => this.createAction(step));
  }

  reset() {
    this.initialize();
    for (let i = 0; i < this.config.turnTotalCount; i++) this.startNewTurn();
  }

  createAction(step, runtime) {
    const actionIndex = this.actionIndex++;
    return {
      type: "action", actionIndex, text: `${actionIndex}-${step.text}`, group: step.text,
      token: resolveStepToken(step.token, this.config, runtime),
    };
  }

  createTurn(kind) {
    const turn = { index: this.turns.length, kind, actions: [] };
    this.turns.push(turn);
    return turn;
  }

  getInitialContext() {
    return this.initialContext.slice();
  }

  getContextSnapshot() {
    return {
      turns: this.turns
        .filter(turn => !this.compressedRanges.some(([start, end]) => turn.index >= start && turn.index <= end))
        .map(turn => ({ ...turn, actions: turn.actions.slice() })),
    };
  }

  startNewTurn() {
    if (!this.turns.length) this.createTurn("initial").actions.push(...this.getInitialContext());
    const turn = this.createTurn("user");
    turn.turnIndex = this.userTurnCount++;
    this.runPlan(turn);
    const snapshot = this.getContextSnapshot();
    const thresholdReached = this.config.compressionThresholdType === "TOKEN"
      ? contentSize(flatten(snapshot)) >= this.config.compressionThresholdToken
      : snapshot.turns.filter(turn => turn.kind === "user").length >= this.config.compressionThresholdTurnCount;
    // 在流程全部执行后检查，包含最后一次调用之后追加的内容。
    if (thresholdReached) this.doCompress();
  }

  runPlan(turn) {
    let llmIndex = 0;
    for (const [index, step] of this.config.flow.turn.entries()) {
      if (step.enabled === false) continue;
      const runtime = { turnIndex: turn.turnIndex ?? 0, llmIndex };
      let output;
      try { output = this.createAction(step, runtime); }
      catch (error) {
        throw new RangeError(`flow.turn 第 ${index + 1} 步「${step.text}」（turnIndex=${runtime.turnIndex}, llmIndex=${llmIndex}）：${error.message}`);
      }
      if (step.type === "llm") {
        this.appendRequest(turn, output);
        llmIndex++;
      } else turn.actions.push(output);
    }
  }

  appendRequest(turn, output, input = this.getContextSnapshot()) {
    const actionIndex = this.actionIndex++;
    const request = {
      type: "llm", actionIndex, text: `${actionIndex}-llm next plan`, group: "llm next plan",
      input, output, ...this.matchCached(input),
    };
    turn.actions.push(request, output);
  }

  matchCached(input) {
    const actions = flatten(input);
    const previous = actions.findLast(action => action.type === "llm");
    let notCachedIndex = this.initialContext.length;
    if (previous) {
      const previousActions = flatten(previous.input);
      notCachedIndex = 0;
      // 按动作引用匹配前缀，保留原始动作引用及每次请求的独立快照。
      while (notCachedIndex < previousActions.length && previousActions[notCachedIndex] === actions[notCachedIndex]) notCachedIndex++;
    }
    const retained = new Set(input.turns.filter(turn => turn.compressionKept).flatMap(turn => turn.actions));
    const actionGroupTokens = Object.create(null);
    let cachedToken = 0, notCachedToken = 0;
    actions.forEach((action, index) => {
      if (action.type === "llm") return;
      const hit = index < notCachedIndex ? action.token * this.config.expectedPrefixCacheHitRate : 0;
      const miss = action.token - hit;
      const group = retained.has(action) ? "compression retained turns" : action.group;
      const tokens = actionGroupTokens[group] ??= { cachedToken: 0, notCachedToken: 0 };
      tokens.cachedToken += hit;
      tokens.notCachedToken += miss;
      cachedToken += hit;
      notCachedToken += miss;
    });
    return { notCachedIndex, cachedToken, notCachedToken, actionGroupTokens };
  }

  doCompress() {
    const snapshot = this.getContextSnapshot();
    const userTurns = snapshot.turns.filter(turn => turn.kind === "user");
    const count = userTurns.length - this.config.compressionKeepTurns;
    if (count <= 0) return;
    const kept = userTurns.slice(count);
    const start = (this.compressedRanges.at(-1)?.[1] ?? 0) + 1;
    const end = kept.length ? kept[0].index - 1 : snapshot.turns.at(-1).index;
    this.compressedRanges.push([start, end]);
    // 标记只影响后续快照，历史请求的归因保持不变。
    kept.forEach(turn => { this.turns[turn.index].compressionKept = true; });
    const turn = this.createTurn("compression");
    this.appendRequest(turn, this.createAction({ text: "compress history", token: this.config.compressionTargetToken }), snapshot);
  }

  getConsumptionTokens() {
    const model = this.config.model;
    for (const key of priceKeys) {
      if (!Number.isFinite(model[key]) || model[key] < 0) throw new RangeError(`请提供模型的 ${key}（非负有限单价）`);
    }
    const llms = this.turns.flatMap(turn => turn.actions).filter(action => action.type === "llm");
    let totalInputCached = 0, totalInputNotCached = 0, totalOutput = 0;
    const actionGroupTokens = Object.create(null);
    for (const request of llms) {
      totalInputCached += request.cachedToken;
      totalInputNotCached += request.notCachedToken;
      totalOutput += request.output.token;
      for (const [group, tokens] of Object.entries(request.actionGroupTokens)) {
        const total = actionGroupTokens[group] ??= { cachedToken: 0, notCachedToken: 0 };
        total.cachedToken += tokens.cachedToken;
        total.notCachedToken += tokens.notCachedToken;
      }
    }
    const totalInputCachedPrice = totalInputCached / 1000 * model.inputCachedPrice;
    const totalInputNotCachedPrice = totalInputNotCached / 1000 * model.inputNotCachedPrice;
    const totalOutputPrice = totalOutput / 1000 * model.outputPrice;
    const userTurnCount = this.turns.filter(turn => turn.kind === "user").length;
    return {
      llms, actionGroupTokens, totalInputCached, totalInputNotCached, totalOutput,
      totalInputCachedPrice, totalInputNotCachedPrice, totalOutputPrice,
      totalPrice: totalInputCachedPrice + totalInputNotCachedPrice + totalOutputPrice,
      averageUserTurnsPerCompression: this.compressedRanges.length ? userTurnCount / this.compressedRanges.length : null,
    };
  }
}
