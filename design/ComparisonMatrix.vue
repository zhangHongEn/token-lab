<script setup>
import { computed, ref, onBeforeUnmount } from 'vue';
import { Workflow, ArrowDown, ArrowUp, ArrowUpRight, Copy, Trash2, Star, ChevronDown, ChevronLeft, ChevronRight, Check, MoreHorizontal } from 'lucide-vue-next';
import { displayPlanColor } from '../src/theme.js';
const props = defineProps({results:Array, config:Object, busy:Boolean});
const emit = defineEmits(['edit','copy','remove','baseline']);
const costMode = ref('cost'), expanded = ref(true), menu = ref(''), scroller = ref(null);
const baseline = computed(()=>props.results.find(r=>r.planId===props.config.baselineId)||props.results[0]);
const lowest = computed(()=>Math.min(...props.results.map(r=>r.cost.total)));
const fmt = (v, digits=2) => Number(v||0).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const money = v => '$'+fmt(v);
const token = v => Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});
const rate = v => v == null ? '—' : (v*100).toFixed(1)+'%';
const delta = r => baseline.value?.cost.total ? Math.abs((r.cost.total-baseline.value.cost.total)/baseline.value.cost.total) : null;
const shortName = name => name.replace('百炼 · ','').replace(' · 固定价格','');
const parts = [
  {key:'cached',tokens:'hit',label:'缓存命中输入',color:'#88a997'},
  {key:'fresh',tokens:'miss',label:'未命中输入',color:'#d6ae7e'},
  {key:'generated',tokens:'output',label:'模型输出',color:'#c57863'},
];
const metrics = [
  {key:'initialContext',label:'初始上下文',format:r=>token(r.initialContext)+' K'},
  {key:'peakInput',label:'峰值请求输入',format:r=>token(r.peakInput)+' K'},
  {key:'hitRate',label:'输入命中率',format:r=>rate(r.hitRate)},
  {key:'requests',label:'模型请求次数',format:r=>r.requests.length.toLocaleString()+' 次'},
  {key:'compressions',label:'上下文压缩次数',format:r=>r.compressions.length.toLocaleString()+' 次'},
];
function action(type,id){menu.value='';emit(type,id);}
function scrollColumns(dir){scroller.value?.scrollBy({left:dir*300,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
function closeMenu(e){if(!e.target.closest('.matrix-menu-anchor'))menu.value='';}
if(typeof document!=='undefined')document.addEventListener('pointerdown',closeMenu);
onBeforeUnmount(()=>document.removeEventListener('pointerdown',closeMenu));
</script>

<template>
  <section class="comparison-matrix" aria-label="方案对比矩阵" :aria-busy="busy">
    <div class="matrix-toolbar">
      <div class="matrix-kicker"><span class="matrix-status"></span>同一指标，横向比较<span class="matrix-toolbar-separator">/</span><span>USD · 完整会话</span></div>
      <div class="matrix-toolbar-actions"><span v-if="results.length>4" class="matrix-scroll-hint">左右滑动查看全部方案</span><button v-if="results.length>4" class="matrix-arrow" aria-label="向左查看方案" @click="scrollColumns(-1)"><ChevronLeft :size="14"/></button><button v-if="results.length>4" class="matrix-arrow" aria-label="向右查看方案" @click="scrollColumns(1)"><ChevronRight :size="14"/></button><button class="matrix-toggle" :aria-expanded="expanded" @click="expanded=!expanded">{{ expanded?'收起详细指标':'展开详细指标' }}<ChevronDown :size="13" :class="{folded:!expanded}"/></button></div>
    </div>
    <div ref="scroller" class="matrix-scroll" tabindex="0" aria-label="方案比较，可横向滚动">
      <table class="matrix-table" :style="{'--plan-count':results.length}">
        <colgroup><col class="metric-col"/><col v-for="r in results" :key="r.planId" class="scenario-col"/></colgroup>
        <thead><tr>
          <th class="matrix-label hero-label" scope="col"><span class="matrix-eyebrow">COST OVERVIEW</span><h3>把差异<br/>放在同一视线。</h3><p>先看总成本<br/>再看每一项构成</p><span class="matrix-unit-note">计费单位 · USD</span></th>
          <th v-for="r in results" :key="r.planId" scope="col" class="scenario-hero" :class="{'is-baseline':r.planId===config.baselineId}" :style="{'--scenario-color':displayPlanColor(r.color)}">
            <div class="matrix-plan-heading"><span class="matrix-plan-icon"><Workflow :size="18"/></span><button class="matrix-plan-name" @click="emit('edit',r.planId)" :title="r.planName">{{ r.planName }}</button><span v-if="r.planId===config.baselineId" class="matrix-base-tag">基准</span><div class="matrix-menu-anchor"><button class="matrix-more" :aria-label="r.planName+' 的更多操作'" :aria-expanded="menu===r.planId" @click="menu=menu===r.planId?'':r.planId"><MoreHorizontal :size="17"/></button><div v-if="menu===r.planId" class="matrix-menu"><button @click="action('baseline',r.planId)"><Star :size="13"/>设为基准</button><button :disabled="results.length>=8" @click="action('copy',r.planId)"><Copy :size="13"/>复制方案</button><button @click="action('remove',r.planId)"><Trash2 :size="13"/>删除方案</button></div></div></div>
            <p class="matrix-model" :title="r.model.name">{{ shortName(r.model.name) }}<span>· {{ r.rounds.length }} 轮</span></p>
            <div class="matrix-price" :title="'$'+fmt(r.cost.total,8)"><span class="matrix-currency">$</span>{{ fmt(r.cost.total).split('.')[0] }}<span class="matrix-decimal">.{{ fmt(r.cost.total).split('.')[1] }}</span></div>
            <div class="matrix-difference"><span v-if="r.planId===config.baselineId" class="baseline-caption-matrix">对比基准</span><template v-else><span class="matrix-change" :class="{increase:r.cost.total>baseline.cost.total}"><ArrowDown v-if="r.cost.total<=baseline.cost.total" :size="12"/><ArrowUp v-else :size="12"/>{{ rate(delta(r)) }}</span><span class="matrix-saving">{{ r.cost.total<=baseline.cost.total?'节省':'增加' }} {{ money(Math.abs(r.cost.total-baseline.cost.total)) }}</span></template></div>
            <div class="matrix-stack" role="img" :aria-label="r.planName+'费用构成'"><span v-for="p in parts" :key="p.key" :style="{width:(r.cost.total?r.cost[p.key]/r.cost.total*100:0)+'%',background:p.color}" :title="p.label+' '+money(r.cost[p.key])"></span></div>
          </th>
        </tr></thead>
        <tbody>
          <tr class="matrix-section-row"><th scope="row" class="matrix-label"><span>费用拆解</span></th><td v-for="(r,i) in results" :key="r.planId" class="matrix-section-cell"><div v-if="i===0" class="matrix-mode" aria-label="费用拆解单位"><button :aria-pressed="costMode==='cost'" @click="costMode='cost'">费用</button><button :aria-pressed="costMode==='tokens'" @click="costMode='tokens'">Token</button></div><span v-else class="matrix-mode-label">{{ costMode==='cost'?'USD':'K Token' }}</span></td></tr>
          <tr v-for="p in parts" :key="p.key" class="matrix-data-row"><th scope="row" class="matrix-label"><i :style="{background:p.color}"></i>{{ p.label }}</th><td v-for="r in results" :key="r.planId" class="matrix-value"><div><strong :title="costMode==='cost'?'$'+fmt(r.cost[p.key],8):token(r[p.tokens])+' K Token'">{{ costMode==='cost'?money(r.cost[p.key]):token(r[p.tokens]) }}<small v-if="costMode==='tokens'">K</small></strong><span>{{ rate(r.cost.total ? r.cost[p.key]/r.cost.total : 0) }}</span></div></td></tr>
          <template v-if="expanded"><tr class="matrix-section-row"><th scope="row" class="matrix-label">运行指标</th><td v-for="r in results" :key="r.planId" class="matrix-section-cell"><span>会话模拟</span></td></tr><tr v-for="metric in metrics" :key="metric.key" class="matrix-data-row"><th scope="row" class="matrix-label">{{ metric.label }}</th><td v-for="r in results" :key="r.planId" class="matrix-value"><div><strong>{{ metric.format(r) }}</strong><span v-if="metric.key==='hitRate'" class="matrix-hit-track"><i :style="{width:rate(r.hitRate)}"></i></span></div></td></tr></template>
        </tbody>
        <tfoot><tr><td class="matrix-label matrix-footer-note">{{ busy?'正在更新…':'本地模拟 · 无需 API Key' }}</td><td v-for="r in results" :key="r.planId" class="matrix-footer-cell"><div><button class="matrix-base-button" :aria-label="'设为基准 '+r.planName" :aria-pressed="r.planId===config.baselineId" @click="emit('baseline',r.planId)"><Check v-if="r.planId===config.baselineId" :size="13"/><Star v-else :size="13"/>{{ r.planId===config.baselineId?'当前基准':'设为基准' }}</button><button class="matrix-edit" :aria-label="'编辑 '+r.planName" @click="emit('edit',r.planId)">编辑<ArrowUpRight :size="13"/></button></div></td></tr></tfoot>
      </table>
    </div>
    <div class="matrix-footnote"><span>费用包含压缩请求；显示金额保留两位小数，悬停查看精确值。</span><span>同列看方案，同排比差异</span></div>
  </section>
</template>
