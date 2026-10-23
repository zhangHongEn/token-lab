<script setup>
import { computed, ref, watch } from "vue";
import { ChartNoAxesCombined, ListTree, Rows3, ArrowDownToLine, ChevronLeft, ChevronRight, Layers, ArrowRight } from "lucide-vue-next";
import { ratio } from "../session-report.js";
import { money, token, percent, roundRange } from "../utils.js";
import { exportCsv } from "../export.js";
import { sourceOption, trendOption } from "../charts.js";
import { compareSources } from "../comparison.js";
import EChart from "./EChart.vue";
const props = defineProps({ results: Array, config: Object });
const tab = ref("sources");
const metric = ref("cumulativeCost");
const plan = ref(0);
const page = ref(1);
const selectedRound = ref(null);
const metrics = [["cumulativeCost", "累计费用"], ["cost", "当轮费用"], ["peakInput", "每轮峰值输入"], ["context", "轮末上下文"], ["cumulativeTokens", "累计 Token"]];
const result = computed(() => props.results[plan.value] || props.results[0]);
const planNames = computed(() => props.results.map(r => r.planName));
const currency = computed(() => props.results[0].model.currency);
watch(() => props.results, () => { plan.value = 0; page.value = 1; selectedRound.value = null; });
watch(plan, () => { page.value = 1; selectedRound.value = null; }, { flush: "sync" });
const pageCount = computed(() => Math.ceil(result.value.rounds.length / 5));
const rounds = computed(() => result.value.rounds.slice((page.value - 1) * 5, page.value * 5));
const trend = computed(() => trendOption(props.results, metric.value, currency.value));
const sourceChart = computed(() => sourceOption(props.results, currency.value));
const sourceRows = computed(() => compareSources(props.results, plan.value));
const m = (value, precise = false) => money(value, currency.value, precise);
function openRound(round, planIndex = plan.value) {
  plan.value = planIndex;
  page.value = Math.ceil(round / 5);
  selectedRound.value = round;
  tab.value = "requests";
}
function chartClick(event) {
  if (event.data?.round) openRound(event.data.round, event.data.planIndex);
}
</script>

<template>
  <section class="analysis-panel">
    <nav class="analysis-tabs" aria-label="结果分析"><button :class="{ active: tab === 'sources' }" :aria-pressed="tab === 'sources'" @click="tab = 'sources'"><ListTree :size="17" />费用归因</button><button :class="{ active: tab === 'trend' }" :aria-pressed="tab === 'trend'" @click="tab = 'trend'"><ChartNoAxesCombined :size="17" />会话趋势</button><button :class="{ active: tab === 'requests' }" :aria-pressed="tab === 'requests'" @click="tab = 'requests'"><Rows3 :size="17" />请求明细</button><span>完整会话 · 可追溯</span></nav>
    <div v-if="tab === 'trend'" class="analysis-body">
      <div class="section-heading"><div><h2>会话越长，差异如何变化？</h2><p>圆点标记上下文压缩，点击可查看当轮请求。</p></div><select v-model="metric" aria-label="趋势指标"><option v-for="[key, label] in metrics" :key="key" :value="key">{{ label }}</option></select></div>
      <EChart class="trend-chart" :option="trend" aria-label="各方案的会话趋势图" @select="chartClick" />
      <p class="chart-note">普通点最多采样 250 个，另保留全部压缩点、相邻轮次及峰值；费用统计使用完整数据。</p>
      <div class="compression-overview">
        <div class="section-heading"><div><h3><Layers :size="16" />上下文压缩记录</h3><p>压缩输入包含当时的完整上下文，费用已计入对应用户轮次。</p></div><div class="segmented"><button v-for="(name, i) in planNames" :key="name" :class="{ active: plan === i }" @click="plan = i">{{ name }}</button></div></div>
        <div v-if="!result.compressions.length" class="inline-empty">本次会话未触发上下文压缩。</div>
        <div v-else class="compression-events">
          <button v-for="event in result.compressions" :key="event.requestId" class="compression-event" @click="openRound(event.round)">
            <span class="event-round">第 {{ event.round }} 轮</span><span>{{ token(event.before) }} <ArrowRight :size="13" /> {{ token(event.after) }}</span><span class="event-kept">保留 {{ roundRange(event.keptRounds) }}</span><b>{{ m(event.cost) }}</b><ChevronRight :size="14" />
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="tab === 'sources'" class="analysis-body">
      <div class="section-heading"><div><h2>费用花在了哪里？</h2><p>按内容来源统计命中输入、未命中输入和输出费用。</p></div><button @click="exportCsv(results, config, 'sources')"><ArrowDownToLine :size="14" />导出归因 CSV</button></div>
      <EChart :style="{ height: Math.max(220, results.length * 65 + 80) + 'px' }" class="source-chart" :option="sourceChart" aria-label="各方案费用来源堆叠条形图" />
      <div class="table-toolbar"><p>Token 分项：{{ planNames[plan] }}</p><div class="segmented"><button v-for="(name, i) in planNames" :key="name" :class="{ active: plan === i }" @click="plan = i">{{ name }}</button></div></div>
      <div class="table-scroll"><table class="source-table"><thead><tr><th>内容来源</th><th>命中输入</th><th>未命中输入</th><th>输出</th><th v-for="r in results" :key="r.planId">{{ r.planName }}费用</th><th>当前方案占比</th></tr></thead><tbody><tr v-for="source in sourceRows" :key="source.key"><td>{{ source.name }}</td><td>{{ token(source.hit) }}</td><td>{{ token(source.miss) }}</td><td>{{ token(source.output) }}</td><td v-for="(cost, i) in source.costs" :key="results[i].planId">{{ m(cost, true) }}</td><td>{{ percent(ratio(source.cost, result.cost.total)) }}</td></tr></tbody><tfoot><tr><th>合计</th><td>{{ token(result.hit) }}</td><td>{{ token(result.miss) }}</td><td>{{ token(result.output) }}</td><td v-for="r in results" :key="r.planId">{{ m(r.cost.total, true) }}</td><td>{{ percent(ratio(result.cost.total, result.cost.total)) }}</td></tr></tfoot></table></div>
      <p class="field-note attribution-note">“压缩保留轮次”归集保留内容在后续请求中的输入费用，不与原来源重复计费；模型输出归入生成时的来源。“压缩摘要”是内容来源，概览中的“压缩请求费用”则包含压缩时的全部输入和输出。</p>
      <div class="cache-equivalent"><span>命中输入的未命中费用等值</span><strong>{{ token(result.equivalent) }}</strong><small>{{ result.equivalent === null ? '未命中单价为 0，无法折算。' : '仅折算费用，不改变输入长度或上下文占用。' }}</small></div>
    </div>
    <div v-else class="analysis-body">
      <div class="section-heading"><div><h2>每一次请求，都可追溯。</h2><p>按用户轮次查看模型调用，压缩请求附在触发轮次之后。</p></div><button @click="exportCsv(results, config, 'requests')"><ArrowDownToLine :size="14" />导出请求 CSV</button></div>
      <div class="table-toolbar"><div class="segmented"><button v-for="(name, i) in planNames" :key="name" :class="{ active: plan === i }" @click="plan = i">{{ name }}</button></div><div class="pagination"><button class="icon-button" aria-label="上一页" :disabled="page === 1" @click="page--"><ChevronLeft :size="16" /></button><span>{{ page }} / {{ pageCount }}</span><button class="icon-button" aria-label="下一页" :disabled="page === pageCount" @click="page++"><ChevronRight :size="16" /></button></div></div>
      <div class="round-list">
        <details v-for="round in rounds" :key="plan + '-' + round.round" class="round-detail" :open="selectedRound === round.round">
          <summary><span><strong>第 {{ round.round }} 轮</strong><small>{{ round.requestIds.length }} 次请求</small><em v-if="round.compression">发生压缩</em></span><span><b>{{ m(round.cost) }}</b><ChevronRight :size="14" /></span></summary>
          <div v-if="round.compression" class="compression-explanation"><Layers :size="16" /><div>压缩 {{ roundRange(round.compression.compressedRounds) }} · 保留 {{ roundRange(round.compression.keptRounds) }}<br />摘要 {{ token(round.compression.summary) }} · 上下文 {{ token(round.compression.before) }} → {{ token(round.compression.after) }}</div></div>
          <details v-for="request in round.requestIds.map(id => result.requests[id - 1])" :key="request.id" class="request-detail">
            <summary><span><small>#{{ request.id }}</small>{{ request.stage }}</span><span class="request-summary">输入 {{ token(request.input) }} · 输出 {{ token(request.output) }}<b>{{ m(request.cost.total) }}</b></span></summary>
            <div class="request-body">
              <div class="request-metrics"><span>匹配前缀 <b>{{ token(request.prefix) }}</b></span><span>命中输入 <b>{{ token(request.hit) }}</b></span><span>未命中输入 <b>{{ token(request.miss) }}</b></span><span>后续追加内容 <b>{{ token(request.toolResult) }}</b></span></div>
              <div class="formula">命中输入 = 匹配前缀 {{ token(request.prefix) }} × {{ percent(result.expectedPrefixCacheHitRate) }} = {{ token(request.hit) }}<br />未命中输入 = 总输入 {{ token(request.input) }} − 命中输入 {{ token(request.hit) }} = {{ token(request.miss) }}<br />本次费用 = 命中 {{ m(request.cost.cached, true) }} + 未命中 {{ m(request.cost.fresh, true) }} + 输出 {{ m(request.cost.generated, true) }}<br />累计费用：{{ m(request.cumulativeCost, true) }}</div>
              <div class="table-scroll"><table><thead><tr><th>请求内容来源</th><th>命中</th><th>未命中</th><th>输出</th><th>费用</th></tr></thead><tbody><tr v-for="source in request.attribution" :key="source.key"><td>{{ source.name }}</td><td>{{ token(source.hit) }}</td><td>{{ token(source.miss) }}</td><td>{{ token(source.output) }}</td><td>{{ m(source.cost.total, true) }}</td></tr></tbody></table></div>
            </div>
          </details>
        </details>
      </div>
    </div>
  </section>
</template>
