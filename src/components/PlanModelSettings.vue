<script setup>
import { computed } from "vue";
import { createPresetConfig, priceFields } from "../config.js";
import { modelPresets } from "../model-pricing.js";
import { resolvePlan } from "../comparison.js";
const props = defineProps({ plan: Object, globalModelId: String, errors: Object });
const inherited = computed(() => !!props.plan.useGlobal?.model);
const effective = computed(() => resolvePlan(props.plan, undefined, props.globalModelId));
function toggleInheritance() {
  props.plan.useGlobal ??= {};
  props.plan.useGlobal.model = !inherited.value;
}
function chooseModel(event) {
  const preset = modelPresets.find(p => p.id === event.target.value);
  if (preset) Object.assign(props.plan, createPresetConfig(preset));
}
function markCustom() {
  props.plan.pricing = { id: "custom", label: "手动费率", source: "", date: "" };
}
</script>

<template>
  <section class="plan-model-settings">
    <label class="field"><span>模型<button type="button" class="inherit-btn" :class="{ inherited }" :aria-pressed="inherited" aria-label="继承全局模型" @click.prevent="toggleInheritance">{{ inherited ? '继承全局' : '独立设置' }}</button></span><select :value="effective.pricing.id" :disabled="inherited" aria-label="方案模型" @change="chooseModel"><option v-if="!modelPresets.some(p => p.id === effective.pricing.id)" :value="effective.pricing.id">当前自定义费率</option><option v-for="preset in modelPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label>
    <p v-if="inherited" class="field-help">模型和费用跟随全局选择，使用所选模型的内置费率。</p>
    <template v-else>
      <label class="field"><span>模型名称</span><input v-model="plan.model.name" maxlength="100" aria-label="模型名称" @input="markCustom" /><small v-if="errors?.name" class="error">{{ errors.name }}</small></label>
      <div class="fields-grid"><label v-for="[key, label] in priceFields" :key="key" class="field"><span>{{ label }} · USD / 1M Token</span><input type="number" min="0" step="any" v-model.number="plan.model[key]" :aria-label="label + '单价'" @input="markCustom" /><small v-if="errors?.[key]" class="error">{{ errors[key] }}</small></label></div>
    </template>
    <p class="field-help">费率快照：{{ effective.pricing.date || '自定义' }}。不联网更新，不调用真实模型。<a v-if="effective.pricing.source?.startsWith('https://')" :href="effective.pricing.source" target="_blank" rel="noopener noreferrer">查看来源 ↗</a></p>
    <p v-if="effective.pricing.note" class="field-help">{{ effective.pricing.note }}</p>
  </section>
</template>

<style scoped>
.plan-model-settings .field > span:first-child { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.inherit-btn { margin-left: auto; min-height: 24px; padding: 3px 8px; font-size: 11px; }
.inherit-btn.inherited { color: #4b7160; background: #f0f5f0; }
.plan-model-settings select { width: 100%; }
.plan-model-settings select:disabled { opacity: .75; cursor: default; }
.plan-model-settings .field-help { margin: 12px 0; }
</style>
