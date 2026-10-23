<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X, Check, SlidersHorizontal, Workflow, Layers, Cpu, ArrowRight } from "lucide-vue-next";
import { createDefaultFlow, createPreloadedFlow } from "../session-flow.js";
import { groups, compressionFields, priceFields } from "../config.js";
import ParameterPanel from "./ParameterPanel.vue";
import PlanModelSettings from "./PlanModelSettings.vue";
import FlowEditor from "./FlowEditor.vue";
import InheritedParameter from "./InheritedParameter.vue";
import { globalFields, thresholdField } from "../comparison.js";

const props = defineProps({ plan: Object, globalSimulation: Object, globalModelId: String, errors: Object, isNew: Boolean });
const emit = defineEmits(["save", "close"]);
const dialog = ref(null);
const body = ref(null);
const section = ref("params");
const attempted = ref(false);
const template = ref("current");
const sections = [
  { id: "params", label: "基本参数", icon: SlidersHorizontal },
  { id: "flow", label: "执行流程", icon: Workflow },
  { id: "cache", label: "缓存与压缩", icon: Layers },
  { id: "model", label: "模型与费率", icon: Cpu },
];
const errorSection = key => key === "flow" ? "flow"
  : [...compressionFields.map(f => f[0]), ...groups[1].fields.map(f => f[0]), "compressionThresholdType"].includes(key) ? "cache"
  : [...priceFields.map(f => f[0]), "name", "currency"].includes(key) ? "model" : "params";
const errorCounts = computed(() => Object.keys(props.errors).reduce((counts, key) => {
  const id = errorSection(key);
  counts[id] = (counts[id] || 0) + 1;
  return counts;
}, {}));
function submit() {
  attempted.value = true;
  const keys = Object.keys(props.errors);
  if (keys.length) { section.value = errorSection(keys[0]); if (body.value) body.value.scrollTop = 0; return; }
  emit("save");
}
function chooseTemplate() {
  if (template.value === "current") return;
  props.plan.simulation.flow = template.value === "blank" ? { initial: [], turn: [] }
    : template.value === "preloaded" ? createPreloadedFlow() : createDefaultFlow();
}
watch(section, () => { if (body.value) body.value.scrollTop = 0; });
let previousOverflow;
onMounted(() => {
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  dialog.value.showModal();
});
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  dialog.value?.close();
});
</script>

<template>
  <dialog ref="dialog" class="plan-editor" aria-labelledby="editor-title" @cancel.prevent="$emit('close')">
    <header class="editor-heading">
      <div><p class="eyebrow">{{ isNew ? 'NEW EXPERIMENT' : 'EDIT EXPERIMENT' }}</p><h2 id="editor-title">{{ isNew ? '创建一个对比方案' : '编辑方案' }}</h2><p>修改仅在保存后生效，取消会保留原方案。</p></div>
      <button class="icon-button" aria-label="关闭方案编辑" @click="$emit('close')"><X :size="20" /></button>
    </header>
    <nav class="editor-tabs" aria-label="方案编辑分区">
      <button v-for="item in sections" :key="item.id" :aria-pressed="section === item.id" :class="{ active: section === item.id }" @click="section = item.id"><component :is="item.icon" :size="16" />{{ item.label }}<span v-if="attempted && errorCounts[item.id]" class="error-count">{{ errorCounts[item.id] }}</span></button>
    </nav>
    <div ref="body" class="editor-body">
      <div v-if="attempted && Object.keys(errors).length" class="editor-errors" role="alert"><strong>还有 {{ Object.keys(errors).length }} 项需要调整</strong><ul><li v-for="(error, key) in errors" :key="key"><button @click="section = errorSection(key)">{{ error }} <ArrowRight :size="12" /></button></li></ul></div>
      <div v-show="section === 'params'" class="editor-intro-fields">
        <label class="field"><span>方案名称</span><input v-model="plan.name" autofocus maxlength="60" aria-label="方案名称" placeholder="例如：精简检索流程" :aria-invalid="!!errors.planName" /><small v-if="errors.planName" class="error">{{ errors.planName }}</small></label>
        <label v-if="isNew" class="field"><span>流程起点</span><select v-model="template" aria-label="流程起点" @change="chooseTemplate"><option value="current" disabled>保留当前流程</option><option value="lazy">按需发现工具</option><option value="preloaded">预加载工具定义</option><option value="blank">空白流程，从零开始</option></select></label>
      </div>
      <section v-if="section === 'params' || section === 'cache'" class="plan-global-settings" aria-label="方案全局参数设置">
        <InheritedParameter v-for="field in globalFields.filter(([key]) => section === 'params' ? ['turnTotalCount', 'skillsTotalCount', 'toolsTotalCount'].includes(key) : key === 'expectedPrefixCacheHitRate')" :key="field[0]" :plan="plan" :global-simulation="globalSimulation" :field="field" :error="errors[field[0]]" />
        <template v-if="section === 'cache'">
          <InheritedParameter :plan="plan" :global-simulation="globalSimulation" :field="['compressionThresholdType', '压缩阈值类型']" :options="[{ value: 'TURN', label: '用户轮次' }, { value: 'TOKEN', label: '上下文' }]" :error="errors.compressionThresholdType" />
          <InheritedParameter :key="thresholdField(plan.simulation)[0]" :plan="plan" :global-simulation="globalSimulation" :field="thresholdField(plan.simulation)" :error="errors[thresholdField(plan.simulation)[0]]" />
        </template>
      </section>
      <PlanModelSettings v-if="section === 'model'" :plan="plan" :global-model-id="globalModelId" :errors="errors" />
      <ParameterPanel v-else-if="section !== 'flow'" :config="plan" :errors="errors" :section="section" />
      <FlowEditor v-show="section === 'flow'" :simulation="plan.simulation" :error="errors.flow" />
    </div>
    <div class="editor-footer"><span><Check :size="14" />独立方案，不影响其他配置</span><button @click="$emit('close')">取消</button><button class="primary-button" @click="submit">{{ isNew ? '创建并对比' : '保存并对比' }}<ArrowRight :size="15" /></button></div>
  </dialog>
</template>
