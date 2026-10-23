<script setup>
import { computed } from "vue";
import { ChevronDown, Layers, Cpu } from "lucide-vue-next";
import { groups, compressionFields, priceFields, createPresetConfig } from "../config.js";
import { modelPresets } from "../model-pricing.js";
import { token } from "../utils.js";
import ParameterField from "./ParameterField.vue";
import { isGlobalField } from "../comparison.js";
const props = defineProps({ config: Object, errors: Object, section: String });
const visibleGroups = computed(() => props.section === "params" ? groups.filter((_, index) => index !== 1) : props.section === "cache" ? [groups[1]] : []);
const s = computed(() => props.config.simulation);
const visibleCompression = computed(() => compressionFields.filter(([key]) => !isGlobalField(key)));
const sizing = computed(() => {
  const c = s.value;
  const skills = c.skillsTotalCount * c.skillIndexToken;
  const tools = c.toolsTotalCount * c.toolsIndexToken;
  const allow = tools * c.sessionAvgAllowToolsRate;
  const schema = c.toolsTotalCount * c.toolSchemaToken;
  return { skills, tools, allow, schema };
});
function selectRate(event) {
  const preset = modelPresets.find(p => p.id === event.target.value);
  if (!preset) return;
  Object.assign(props.config, createPresetConfig(preset));
}
function markCustom() {
  props.config.pricing = { id: "custom", label: "手动费率", source: "", date: "" };
}
</script>

<template>
  <div class="parameters">
    <details v-for="(group, index) in visibleGroups" :key="group.title" class="parameter-group" open>
      <summary><span><i class="group-number">{{ String(index + 1).padStart(2, '0') }}</i>{{ group.title }}</span><ChevronDown :size="14" /></summary>
      <div class="parameter-fields">
        <ParameterField v-for="field in group.fields.filter(([key]) => !isGlobalField(key))" :key="field[0]" :object="s" :field="field" :error="errors[field[0]]" />
        <div v-if="group === groups[0]" class="field-note">支持 1–1,000 轮；小数数量表示每轮平均用量。</div>
        <div v-if="group === groups[1]" class="field-note">命中率作用于匹配到的前缀。角色比例只决定允许工具列表的长度。</div>
        <div v-if="group === groups[2]" class="derived-values">
          <span>Skills 索引 <b>{{ token(sizing.skills) }}</b></span>
          <span>Tools 索引 <b>{{ token(sizing.tools) }}</b></span>
          <span>角色允许列表 <b>{{ token(sizing.allow) }}</b></span>
          <span>全量 Schema <b>{{ token(sizing.schema) }}</b></span>
        </div>
      </div>
    </details>
    <details v-if="section === 'cache'" class="parameter-group compression-parameters" open>
      <summary><span><Layers :size="15" />上下文压缩</span><ChevronDown :size="14" /></summary>
      <div class="parameter-fields">
        <ParameterField v-for="field in visibleCompression" :key="field[0]" :object="s" :field="field" :error="errors[field[0]]" />
        <p class="field-note">在每轮流程结束后检查，压缩会额外请求一次模型。摘要长度不等于压缩后的总上下文。</p>
      </div>
    </details>
    <details v-if="section === 'model'" class="parameter-group" open>
      <summary><span><Cpu :size="15" />模型与费率</span><ChevronDown :size="14" /></summary>
      <div class="parameter-fields">
        <label class="field"><span>费率预设</span><select :value="config.pricing.id" aria-label="费率预设" @change="selectRate"><option v-if="!modelPresets.some(p => p.id === config.pricing.id)" :value="config.pricing.id">当前自定义费率</option><option v-for="preset in modelPresets" :key="preset.id" :value="preset.id">{{ preset.name }} · {{ preset.currency }}</option></select></label>
        <label class="field"><span>模型名称</span><input v-model="config.model.name" maxlength="100" aria-label="模型名称" @input="markCustom" /><small v-if="errors.name" class="error">{{ errors.name }}</small></label>
        <ParameterField v-for="[key, label] in priceFields" :key="key" :object="config.model" :field="[key, label, config.model.currency + '/M', 0]" :error="errors[key]" @change="markCustom" />
        <p class="field-note">{{ config.pricing.label }}<template v-if="config.pricing.date"> · {{ config.pricing.date }}</template>。所有费率与费用统一为美元（$），单价单位为 $/百万 Token，修改后使用自定义费率。<a v-if="config.pricing.source?.startsWith('https://')" :href="config.pricing.source" target="_blank" rel="noopener noreferrer">查看来源 ↗</a></p>
        <p v-if="config.pricing.note" class="field-note">{{ config.pricing.note }}</p>
      </div>
    </details>
    <div class="aside-footnote">1K = 1,000 Token<br />所有计算在本地完成，不调用模型 API。</div>
  </div>
</template>
