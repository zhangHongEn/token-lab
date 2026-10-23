<script setup>
import { computed, nextTick, ref, shallowRef, toRaw, watch } from "vue";
import { ArrowUp, ArrowDown, Plus, Trash2, ChevronDown, Copy, Undo2, FileText, Sparkles, Braces } from "lucide-vue-next";
import { resolveStepToken, tokenParameters, tokenFormula, formulaVariables, runtimeParameters, stepRuntime } from "../session-flow.js";
import { maxFormulaLength } from "../token-formula.js";
import { sourceNames } from "../session-report.js";
import { token } from "../utils.js";
import VariablePicker from "./VariablePicker.vue";

const props = defineProps({ simulation: Object, error: String });
const container = ref(null);
const phase = ref("initial");
const openId = ref(null);
const removed = ref(null);
const picker = shallowRef(null);
function runtimeFor(step) {
  return stepRuntime(props.simulation.flow, phase.value, props.simulation.flow[phase.value].indexOf(step));
}
const pickerVariables = computed(() => {
  if (!picker.value) return [];
  const values = formulaVariables(props.simulation, runtimeFor(picker.value.step));
  return Object.entries({ ...runtimeParameters, ...tokenParameters }).map(([key, label]) => ({
    key, label, group: Object.hasOwn(runtimeParameters, key) ? "运行变量" : "方案参数",
    value: Number.isFinite(values[key]) ? Number(values[key].toFixed(6)) : "待填写",
  }));
});
const stepIds = new WeakMap();
let nextStepId = 0;
function stepKey(step) {
  if (!stepIds.has(step)) stepIds.set(step, nextStepId++);
  return stepIds.get(step);
}
const phases = [
  { key: "initial", label: "初始上下文", note: "先放入系统提示、业务背景或工具定义，作为会话的起点。" },
  { key: "turn", label: "每轮流程" },
];
const name = step => Object.hasOwn(sourceNames, step.text) ? sourceNames[step.text] : step.text;
const modeValues = new WeakMap();
function openVariables(step) {
  const input = container.value?.querySelector(`[data-step="${stepKey(step)}"] textarea`);
  const length = tokenFormula(step.token).length;
  picker.value = { step, input, start: Math.min(input?.selectionStart ?? length, length), end: Math.min(input?.selectionEnd ?? length, length) };
}
async function closeVariables() {
  const entry = picker.value;
  picker.value = null;
  await nextTick();
  entry?.input?.focus();
  entry?.input?.setSelectionRange(entry.start, entry.end);
}
async function insertVariable(variable) {
  const { step, input, start, end } = picker.value;
  const expression = tokenFormula(step.token);
  step.token = expression.slice(0, start) + variable + expression.slice(end);
  picker.value = null;
  await nextTick();
  input?.focus();
  input?.setSelectionRange(start + variable.length, start + variable.length);
}
function formulaError(step) {
  try { resolveStepToken(step.token, props.simulation, runtimeFor(step)); return ""; } catch (error) { return error.message; }
}
function move(index, delta) {
  const steps = props.simulation.flow[phase.value];
  const [step] = steps.splice(index, 1);
  steps.splice(index + delta, 0, step);
}
async function reveal(step) {
  openId.value = stepKey(step);
  await nextTick();
  container.value?.querySelector(`[data-step="${openId.value}"] input[type="text"]`)?.focus();
}
function add(type) {
  const steps = props.simulation.flow[phase.value];
  steps.push({ type, text: type === "llm" ? "模型输出" : "追加内容", token: 1 });
  reveal(steps.at(-1));
}
function duplicate(index) {
  const steps = props.simulation.flow[phase.value];
  const copy = structuredClone(toRaw(steps[index]));
  copy.text = `${name(copy)} 副本`;
  steps.splice(index + 1, 0, copy);
  reveal(steps[index + 1]);
}
function remove(index) {
  const [step] = props.simulation.flow[phase.value].splice(index, 1);
  removed.value = { phase: phase.value, index, step };
}
function undoRemove() {
  const entry = removed.value;
  phase.value = entry.phase;
  const steps = props.simulation.flow[entry.phase];
  const index = Math.min(entry.index, steps.length);
  steps.splice(index, 0, entry.step);
  removed.value = null;
  reveal(steps[index]);
}
watch(() => props.simulation.flow, () => { removed.value = null; openId.value = null; picker.value = null; });
function changeTokenMode(step, event) {
  const previous = modeValues.get(step) || {};
  const isFixed = typeof step.token === "number";
  previous[isFixed ? "fixed" : "formula"] = step.token;
  modeValues.set(step, previous);
  if (event.target.value === "formula") step.token = previous.formula ?? String(Number.isFinite(step.token) ? step.token : 1);
  else {
    let value = 1;
    try { value = resolveStepToken(step.token, props.simulation, runtimeFor(step)); } catch { /* 无效公式仍可切回固定长度。 */ }
    step.token = previous.fixed ?? value;
  }
}
function size(step) {
  try { return token(resolveStepToken(step.token, props.simulation, runtimeFor(step))); } catch { return "待修正"; }
}
</script>

<template>
  <div ref="container" class="flow-editor">
    <nav class="flow-phases" aria-label="流程阶段"><button v-for="item in phases" :key="item.key" :class="{ active: phase === item.key }" :aria-pressed="phase === item.key" @click="phase = item.key">{{ item.label }}<span>{{ simulation.flow[item.key].length }} 步</span></button></nav>
    <p v-if="phase === 'initial'" class="flow-description">{{ phases[0].note }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="removed" class="flow-undo" role="status"><span>已删除「{{ name(removed.step) }}」</span><button @click="undoRemove"><Undo2 :size="13" />撤销删除步骤</button></div>
    <section :aria-label="(phase === 'initial' ? '初始上下文' : '每轮流程') + '流程编辑'">
      <article v-for="(step, index) in simulation.flow[phase]" :key="stepKey(step)" :data-step="stepKey(step)" class="flow-step" :class="{ 'flow-disabled': step.enabled === false, expanded: openId === stepKey(step) }">
        <div class="flow-row">
          <button class="step-expand" :aria-expanded="openId === stepKey(step)" :aria-label="'编辑第 ' + (index + 1) + ' 步 ' + name(step)" @click="openId = openId === stepKey(step) ? null : stepKey(step)"><span class="step-index">{{ String(index + 1).padStart(2, '0') }}</span><span class="step-title"><strong>{{ name(step) || '未命名步骤' }}</strong><small><component :is="step.type === 'llm' ? Sparkles : FileText" :size="11" />{{ step.type === 'llm' ? '模型调用' : '追加内容' }} · {{ size(step) }}</small></span><ChevronDown :size="14" /></button>
          <div class="flow-step-actions">
            <label class="flow-enabled"><input type="checkbox" :aria-label="'启用第 ' + (index + 1) + ' 步'" :checked="step.enabled !== false" @change="step.enabled = $event.target.checked" /><span>启用</span></label>
            <button class="icon-button" :disabled="index === 0" :aria-label="'上移第 ' + (index + 1) + ' 步'" title="上移" @click="move(index, -1)"><ArrowUp :size="14" /></button>
            <button class="icon-button" :disabled="index === simulation.flow[phase].length - 1" :aria-label="'下移第 ' + (index + 1) + ' 步'" title="下移" @click="move(index, 1)"><ArrowDown :size="14" /></button>
            <button class="icon-button" :aria-label="'复制第 ' + (index + 1) + ' 步'" title="复制" @click="duplicate(index)"><Copy :size="14" /></button>
            <button class="icon-button" :aria-label="'删除第 ' + (index + 1) + ' 步'" title="删除" @click="remove(index)"><Trash2 :size="14" /></button>
          </div>
        </div>
        <div v-if="openId === stepKey(step)" class="flow-step-fields">
          <label class="field"><span>步骤名称 / 费用来源</span><input type="text" :value="name(step)" @input="step.text = $event.target.value" /></label>
          <label v-if="phase === 'turn'" class="field"><span>步骤类型</span><select v-model="step.type"><option value="action">追加内容（消息 / 工具结果）</option><option value="llm">模型调用（生成内容）</option></select></label>
          <label class="field"><span>长度设置</span><select :value="typeof step.token === 'number' ? 'fixed' : 'formula'" @change="changeTokenMode(step, $event)"><option value="fixed">固定 Token</option><option value="formula">公式</option></select></label>
          <label v-if="typeof step.token === 'number'" class="field"><span>{{ step.type === 'llm' ? '输出长度（K Token）' : '内容长度（K Token）' }}</span><input type="number" min="0" step="any" :value="Number.isFinite(step.token) ? step.token : ''" @input="step.token = $event.target.value === '' ? NaN : Number($event.target.value)" /></label>
          <div v-else class="flow-formula">
            <label class="field"><span>公式（结果单位：K Token）</span><textarea :value="tokenFormula(step.token)" :maxlength="maxFormulaLength" rows="3" spellcheck="false" autocapitalize="off" :aria-invalid="!!formulaError(step)" :aria-describedby="'formula-status-' + stepKey(step)" placeholder="例如：toolResultToken * turnAvgToolsCount" @input="step.token = $event.target.value" /></label>
            <p :id="'formula-status-' + stepKey(step)" class="formula-preview" :class="{ error: formulaError(step) }" role="status">{{ formulaError(step) || '预览结果：' + size(step) + '（1K = 1,000 Token）' }}</p>
            <div class="formula-variable-toolbar"><button @click="openVariables(step)"><Braces :size="15" />插入变量</button></div>
          </div>
        </div>
      </article>
      <div v-if="!simulation.flow[phase].length" class="flow-empty"><FileText :size="26" /><h3>从第一个步骤开始</h3><p>{{ phase === 'initial' ? '添加系统提示、业务背景或工具定义。' : '添加消息、工具结果或模型调用。空流程仍会按轮次检查压缩。' }}</p></div>
    </section>
    <div class="flow-add-actions"><button @click="add('action')"><Plus :size="15" />添加内容</button><button v-if="phase === 'turn'" @click="add('llm')"><Sparkles :size="15" />添加模型调用</button><span>{{ simulation.flow[phase].filter(step => step.enabled !== false).length }} / {{ simulation.flow[phase].length }} 步已启用</span></div>
    <VariablePicker v-if="picker" :variables="pickerVariables" @select="insertVariable" @close="closeVariables" />
  </div>
</template>
