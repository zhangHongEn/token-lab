<script setup>
import { computed } from "vue";
import { Workflow, Pencil, Copy, Trash2, Star } from "lucide-vue-next";
import { maxPlans } from "../comparison.js";
import { displayPlanColor } from "../theme.js";
import { ratio } from "../session-report.js";
import { money, token, percent, number } from "../utils.js";
const props = defineProps({ results: Array, config: Object, visiblePlanId: String });
defineEmits(["edit", "copy", "remove", "baseline"]);
const baseline = computed(() => props.results.find(r => r.planId === props.config.baselineId) || props.results[0]);
const currency = computed(() => props.results[0].model.currency);
const m = value => money(value, currency.value);
function difference(result) {
  const delta = result.cost.total - baseline.value.cost.total;
  if (delta === 0) return "+0.0%";
  const change = ratio(Math.abs(delta), baseline.value.cost.total);
  return change === null ? "—" : `${delta > 0 ? "+" : "-"}${percent(change)}`;
}
const costParts = [["cached", "命中输入", "hit"], ["fresh", "未命中输入", "miss"], ["generated", "模型输出", "output"]];
</script>

<template>
  <div class="comparison-cards">
    <article v-for="result in results.filter(item => !visiblePlanId || item.planId === visiblePlanId)" :key="result.planId" class="strategy-card" :class="{ baseline: result.planId === config.baselineId }" :style="{ '--plan-color': displayPlanColor(result.color) }">
      <div class="strategy-heading"><span class="strategy-icon"><Workflow :size="20" /></span><div><h2>{{ result.planName }}</h2><span>{{ result.rounds.length }} 轮 · 自定义流程</span></div><button class="icon-button" :aria-label="'编辑参数 ' + result.planName" @click="$emit('edit', result.planId)"><Pencil :size="14" /></button></div>
      <p class="result-model">{{ result.model.name }}</p>
      <div class="baseline-comparison" :title="money(result.cost.total, currency, true)">{{ m(result.cost.total) }}<span class="baseline-caption" :class="{ saving: result.cost.total < baseline.cost.total, increase: result.cost.total > baseline.cost.total }">Base<span v-if="result.planId !== baseline.planId" class="baseline-change" :class="{ increase: baseline.cost.total > 0 && result.cost.total > baseline.cost.total, saving: result.cost.total < baseline.cost.total }">{{ difference(result) }}</span></span></div>
      <div class="token-metrics">
        <div v-for="[key, label, tokenKey] in costParts" :key="key">
          <span><i class="dot" :class="key"></i>{{ label }}({{ percent(ratio(result.cost[key], result.cost.total)) }})</span>
          <strong :title="money(result.cost[key], currency, true)">{{ m(result.cost[key]) }}</strong>
          <small>{{ token(result[tokenKey]) }}</small>
        </div>
      </div>
      <div class="cost-bar" :aria-label="'费用构成：命中输入 ' + m(result.cost.cached) + '，未命中输入 ' + m(result.cost.fresh) + '，输出 ' + m(result.cost.generated)">
        <span v-for="[key] in costParts" :key="key" :class="key" :style="{ width: (ratio(result.cost[key], result.cost.total) || 0) * 100 + '%' }"></span>
      </div>
      <dl class="context-metrics">
        <div><dt>初始上下文</dt><dd>{{ token(result.initialContext) }}</dd></div>
        <div><dt>峰值请求输入</dt><dd>{{ token(result.peakInput) }}</dd></div>
        <div><dt>整体输入命中率</dt><dd>{{ percent(result.hitRate) }}</dd></div>
        <div title="用户消息总轮数 ÷ 实际压缩次数；包含末次压缩后尚未再次触发压缩的用户轮次。"><dt>上下文压缩</dt><dd>{{ result.averageUserTurnsPerCompression === null ? '未触发压缩' : `平均${number(result.averageUserTurnsPerCompression)}轮` }}</dd></div>
      </dl>
      <div class="strategy-actions"><button class="baseline-button" :aria-label="'设为Base ' + result.planName" :aria-pressed="result.planId === config.baselineId" @click="$emit('baseline', result.planId)"><Star :size="13" />{{ result.planId === config.baselineId ? 'Base' : '设为Base' }}</button><button :aria-label="'复制方案 ' + result.planName" :disabled="config.plans.length >= maxPlans" @click="$emit('copy', result.planId)"><Copy :size="13" />复制</button><button :aria-label="'删除方案 ' + result.planName" @click="$emit('remove', result.planId)"><Trash2 :size="13" />删除</button></div>
    </article>
  </div>
  <p v-if="results.length === 1 && !visiblePlanId" class="single-plan-note">当前为单方案模拟，新增方案后即可比较费用差异。</p>
</template>
