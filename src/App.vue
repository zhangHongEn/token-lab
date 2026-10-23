<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { Github, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, X, Check, LoaderCircle, Plus, RotateCcw, Undo2 } from "lucide-vue-next";
import { createComparisonConfig, createPlan, readComparisonConfig, validateComparison, validatePlan, resolveBaselineId, resolvePlan, globalFields, thresholdField, planColors, maxPlans } from "./comparison.js";
import { downloadFile } from "./utils.js";
import PlanEditor from "./components/PlanEditor.vue";
import SummaryCards from "./components/SummaryCards.vue";
import AnalysisPanel from "./components/AnalysisPanel.vue";
import ParameterField from "./components/ParameterField.vue";
import GlobalModelField from "./components/GlobalModelField.vue";
import GlyphBackground from "./components/GlyphBackground.vue";
import { useHeaderOpacity } from "./use-header-opacity.js";

const headerSurfaceOpacity = useHeaderOpacity();
const config = ref(createComparisonConfig());
const draft = ref(null);
const draftIsNew = ref(false);
const draftErrors = computed(() => {
  if (!draft.value) return {};
  const errors = validatePlan(draft.value, config.value.globalSimulation, config.value.globalModelId);
  const others = config.value.plans.filter(plan => plan.id !== draft.value.id);
  if (others.some(plan => plan.name.trim() === draft.value.name.trim())) errors.planName = "方案名称已存在，请换一个名称";
  if (others.some(plan => plan.model.currency !== draft.value.model.currency)) errors.currency = "对比方案需使用相同币种";
  return errors;
});
const errors = computed(() => validateComparison(config.value));
const notice = ref("");
const undo = shallowRef(null);
const clone = value => JSON.parse(JSON.stringify(value));
function remember(label) { undo.value = { config: clone(config.value), label }; }
function undoChange() {
  if (!undo.value) return;
  config.value = undo.value.config;
  notice.value = `已撤销${undo.value.label}。`;
  undo.value = null;
}
const report = shallowRef(null);
const busy = ref(false);
const failure = ref("");
const importInput = ref(null);
let worker, debounce, deadline;
function cancel() {
  clearTimeout(debounce);
  clearTimeout(deadline);
  worker?.terminate();
  worker = null;
}
watch(config, () => {
  cancel();
  failure.value = "";
  report.value = null;
  busy.value = false;
  if (Object.keys(errors.value).length || !config.value.plans.length) return;
  busy.value = true;
  const snapshot = JSON.parse(JSON.stringify(config.value));
  debounce = setTimeout(() => {
    const currentWorker = new Worker(new URL("./session.worker.js", import.meta.url), { type: "module" });
    worker = currentWorker;
    const finish = () => { clearTimeout(deadline); currentWorker.terminate(); if (worker === currentWorker) worker = null; busy.value = false; };
    currentWorker.onmessage = ({ data }) => {
      if (worker !== currentWorker) return;
      finish();
      if (data.error) { failure.value = data.error; return; }
      snapshot.baselineId = resolveBaselineId(snapshot, data.results);
      report.value = { results: data.results, config: snapshot };
    };
    currentWorker.onerror = () => { if (worker !== currentWorker) return; finish(); failure.value = "计算失败，请检查参数后重试。"; };
    deadline = setTimeout(() => { if (worker !== currentWorker) return; finish(); failure.value = "计算超过 20 秒，请减少方案数量、轮次或压缩阈值。"; }, 20000);
    currentWorker.postMessage(snapshot);
  }, 220);
}, { deep: true, immediate: true });
onBeforeUnmount(cancel);
const warnings = computed(() => {
  if (!report.value) return [];
  const { results } = report.value;
  const messages = [];
  if (new Set(results.map(r => r.rounds.length)).size > 1) messages.push("各方案的用户轮次不同，当前比较的是各自完整会话的总费用；可统一轮次后再评估节省幅度。");
  for (const r of results) {
    if (r.model.inputCachedPrice > r.model.inputNotCachedPrice) messages.push(`${r.planName}：命中单价高于未命中单价，缓存可能增加费用。`);
    if (r.pricing?.contextWindow && r.peakInput * 1000 > r.pricing.contextWindow) messages.push(`${r.planName}：部分请求超过模型上下文上限，当前展示完整模拟消耗。`);
    if (r.pricing?.tier && r.requests.some(q => q.input * 1000 <= r.pricing.tier.input_tokens_gt || q.input * 1000 > r.pricing.tier.input_tokens_lte)) messages.push(`${r.planName}：部分请求不在所选价格档位内，当前使用固定档位。`);
    if (r.compressions.some(c => c.after >= c.before)) messages.push(`${r.planName}：部分压缩没有缩短上下文，可减小摘要长度或保留轮次。`);
  }
  return messages;
});
function editPlan(id) {
  const plan = config.value.plans.find(plan => plan.id === id);
  if (!plan) return;
  draftIsNew.value = false;
  draft.value = clone(resolvePlan(plan, config.value.globalSimulation));
  draft.value.useGlobal ??= {};
}
function savePlan() {
  if (!draft.value || Object.keys(draftErrors.value).length) return;
  if (draftIsNew.value && config.value.plans.length >= maxPlans) return;
  remember(draftIsNew.value ? "新增方案" : "编辑方案");
  const plan = clone(draft.value);
  plan.name = plan.name.trim();
  const index = config.value.plans.findIndex(item => item.id === plan.id);
  if (index < 0) config.value.plans.push(plan);
  else config.value.plans.splice(index, 1, plan);
  if (!config.value.baselineId) config.value.baselineId = plan.id;
  notice.value = `已保存「${plan.name}」，正在更新对比。`;
  draft.value = null;
}
function setBaseline(id) {
  const plan = config.value.plans.find(plan => plan.id === id);
  if (!plan) return;
  if (config.value.baselineMode !== "auto" && config.value.baselineId === plan.id) return;
  remember("切换基准");
  config.value.baselineId = plan.id;
  config.value.baselineMode = "manual";
  notice.value = `已将「${plan.name}」设为Base。`;
}
function uniqueName(base) {
  const names = new Set(config.value.plans.map(p => p.name.trim()));
  let name = base, index = 2;
  while (names.has(name)) name = `${base.slice(0, 50)} ${index++}`;
  return name;
}
function addPlan(source) {
  if (config.value.plans.length >= maxPlans) return;
  const used = new Set(config.value.plans.map(p => p.color));
  const color = planColors.find(c => !used.has(c)) || planColors[config.value.plans.length % planColors.length];
  const plan = createPlan({ source: source ? JSON.parse(JSON.stringify(source)) : undefined, name: uniqueName(source ? `${source.name.slice(0, 45)} 副本` : "自定义方案"), color });
  if (!source && config.value.plans.length) {
    plan.model = JSON.parse(JSON.stringify(config.value.plans[0].model));
    plan.pricing = JSON.parse(JSON.stringify(config.value.plans[0].pricing));
  }
  draftIsNew.value = true;
  draft.value = resolvePlan(plan, config.value.globalSimulation);
}
function copyPlan(id) {
  const plan = config.value.plans.find(plan => plan.id === id);
  if (plan) addPlan(plan);
}
function removePlan(id) {
  const plan = config.value.plans.find(plan => plan.id === id);
  if (!plan) return;
  remember("删除方案");
  config.value.plans.splice(config.value.plans.indexOf(plan), 1);
  if (config.value.baselineId === plan.id || report.value?.config.baselineId === plan.id) {
    config.value.baselineId = config.value.plans[0]?.id ?? null;
    config.value.baselineMode = "auto";
  }
  notice.value = `已删除「${plan.name}」。`;
}
function reset() {
  remember("恢复默认方案");
  config.value = createComparisonConfig();
  notice.value = "已恢复两套默认方案，可撤销以找回之前的配置。";
}
function exportConfig() {
  downloadFile("token-lab-plans.json", JSON.stringify(report.value?.config ?? config.value, null, 2), "application/json");
  notice.value = "已导出全部方案、Base与费率快照。";
}
async function importConfig(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 4000000) throw new Error("配置文件不能超过 4MB。");
    const imported = readComparisonConfig(JSON.parse(await file.text()));
    remember("导入配置");
    config.value = imported;
    notice.value = "方案已导入。";
  } catch (error) { notice.value = "导入失败：" + error.message; }
  finally { event.target.value = ""; }
}
function editInvalidPlan() {
  const key = Object.keys(errors.value).find(key => key.startsWith("plans."));
  const plan = key ? config.value.plans[Number(key.split(".")[1])] : config.value.plans[0];
  if (plan) editPlan(plan.id);
}
</script>

<template>
  <GlyphBackground />
  <header class="app-header" :style="{ '--header-surface-opacity': headerSurfaceOpacity }">
    <a class="brand" href="./"><span class="brand-mark header-floating"><img src="/token-lab.svg" width="36" height="36" alt="" /></span><strong><b class="brand-title header-floating">Token Lab</b><span class="brand-tagline header-floating">A LITTLE CLARITY FOR EVERY TOKEN</span></strong></a>
    <nav class="header-actions" aria-label="配置操作"><a class="header-github header-floating" href="https://github.com/zhangHongEn/token-lab" target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开 GitHub 仓库"><Github :size="16" /><span>GitHub</span></a><button class="header-floating" aria-label="导入配置" @click="importInput.click()"><ArrowUpFromLine :size="15" /><span>导入配置</span></button><button class="header-floating" aria-label="导出配置" :disabled="!!Object.keys(errors).length" @click="exportConfig"><ArrowDownToLine :size="15" /><span>导出配置</span></button><input ref="importInput" type="file" accept=".json,application/json" hidden @change="importConfig" /></nav>
  </header>
  <div class="workspace comparison-workspace">
    <main>
      <h1 class="sr-only">Token Lab · 会话成本实验室</h1>
      <div v-if="notice || undo" class="notice" role="status"><Check :size="15" /><span>{{ notice || '可以撤销最近一次修改。' }}</span><button v-if="undo" class="undo-button" @click="undoChange"><Undo2 :size="14" />撤销{{ undo.label }}</button><button class="icon-button" aria-label="关闭通知" @click="notice = ''; undo = null"><X :size="14" /></button></div>
      <section class="global-settings" aria-labelledby="global-settings-title">
        <div><h2 id="global-settings-title"><SlidersHorizontal :size="17" />全局配置</h2><p>各方案默认使用以下数值，也可在方案内单独设置。</p></div>
        <div class="global-settings-fields" @focusin="remember('修改全局配置')">
          <GlobalModelField :config="config" :error="errors.globalModelId" />
          <ParameterField v-for="field in globalFields.filter(([key]) => !key.startsWith('compression'))" :key="field[0]" :object="config.globalSimulation" :field="field" :error="errors['globalSimulation.' + field[0]]" />
          <label class="field"><span>压缩阈值类型</span><select v-model="config.globalSimulation.compressionThresholdType" aria-label="压缩阈值类型" :aria-invalid="!!errors['globalSimulation.compressionThresholdType']"><option value="TURN">用户轮次</option><option value="TOKEN">上下文</option></select><small v-if="errors['globalSimulation.compressionThresholdType']" class="error">{{ errors['globalSimulation.compressionThresholdType'] }}</small></label>
          <ParameterField :key="thresholdField(config.globalSimulation)[0]" :object="config.globalSimulation" :field="thresholdField(config.globalSimulation)" :error="errors['globalSimulation.' + thresholdField(config.globalSimulation)[0]]" />
        </div>
      </section>
      <div class="results-heading comparison-heading"><div><h2>对比方案 <span class="plan-count">{{ config.plans.length }}/{{ maxPlans }}</span></h2></div><div class="plan-toolbar"><button @click="reset"><RotateCcw :size="14" />恢复默认方案</button><button class="primary-button" :disabled="config.plans.length >= maxPlans" @click="addPlan()"><Plus :size="15" />新增方案</button></div></div>
      <div v-if="!config.plans.length" class="empty-state"><Plus :size="30" /><h2>从一个方案开始</h2><p>点击上方「新增方案」，或恢复默认的按需、全量方案。</p></div>
      <div v-else-if="Object.keys(errors).length" class="empty-state" role="alert"><SlidersHorizontal :size="30" /><h2>请修正实验参数</h2><p>{{ Object.values(errors)[0] }}</p><button @click="editInvalidPlan">编辑待修正方案</button></div>
      <div v-else-if="failure" class="empty-state" role="alert"><h2>暂时无法完成模拟</h2><p>{{ failure }}</p><div class="failed-plan-actions"><button v-for="plan in config.plans" :key="plan.id" @click="editPlan(plan.id)">编辑 {{ plan.name }}</button></div><button @click="config = JSON.parse(JSON.stringify(config))">重新计算</button></div>
      <div v-else-if="busy" class="empty-state" role="status"><LoaderCircle class="spinner" :size="30" /><h2>正在模拟完整会话</h2><p>逐次记录请求、缓存与上下文压缩…</p></div>
      <template v-else-if="report">
        <div v-for="warning in warnings" :key="warning" class="warning" role="status">{{ warning }}</div>
        <SummaryCards :results="report.results" :config="report.config" @edit="editPlan" @copy="copyPlan" @remove="removePlan" @baseline="setBaseline" />
        <AnalysisPanel :results="report.results" :config="report.config" />
      </template>
      <footer><span class="footer-mark">T / L</span><p>初始前缀按期望命中率计费 · 每轮流程结束后检查压缩 · 最后一轮触发的压缩也计费<br />所有长度以 K Token 计量。预计费用基于当前参数与费率快照，零分母显示「—」。</p><span>COMPARE / V4</span></footer>
    </main>
  </div>
  <PlanEditor v-if="draft" :plan="draft" :global-simulation="config.globalSimulation" :global-model-id="config.globalModelId" :is-new="draftIsNew" :errors="draftErrors" @save="savePlan" @close="draft = null" />
</template>
