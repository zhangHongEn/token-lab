<script setup>
import { computed } from "vue";
import ParameterField from "./ParameterField.vue";
import FieldHint from "./FieldHint.vue";
const props = defineProps({ plan: Object, globalSimulation: Object, field: Array, error: String, options: Array });
const key = computed(() => props.field[0]);
const inherited = computed(() => !!props.plan.useGlobal[key.value]);
const displayed = computed(() => {
  const value = props.globalSimulation[key.value];
  if (props.options) return props.options.find(option => option.value === value)?.label;
  return `${props.field[2] === "%" ? Number((value * 100).toFixed(8)) : value} ${props.field[2]}`;
});
function setSource(event) {
  const enabled = event.target.value === "global";
  props.plan.useGlobal[key.value] = enabled;
  if (enabled) props.plan.simulation[key.value] = props.globalSimulation[key.value];
}
</script>

<template>
  <div class="plan-global-field" :class="{ inherited }">
    <label class="inheritance-source"><span>{{ field[1] }}<FieldHint v-if="field[5]" :text="field[5]" /></span><select :aria-label="field[1] + '来源'" :value="inherited ? 'global' : 'custom'" @change="setSource"><option value="global">使用全局配置</option><option value="custom">单独设置</option></select></label>
    <p v-if="inherited" class="inherited-value">{{ displayed }}<span>随全局配置更新</span></p>
    <label v-else-if="options" class="field"><span class="sr-only">{{ field[1] }}</span><select v-model="plan.simulation[key]" :aria-label="field[1]" :aria-invalid="!!error"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
    <ParameterField v-else :object="plan.simulation" :field="field" :error="error" />
    <small v-if="error && (inherited || options)" class="error">{{ error }}</small>
  </div>
</template>
