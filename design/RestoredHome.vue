<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { Github, Upload, Download, SlidersHorizontal, Plus, RotateCcw, Workflow, ArrowDown, ArrowUp, Check, Copy, Trash2, ChevronRight, ChevronDown } from 'lucide-vue-next';
import { globalFields, thresholdField, resolveBaselineId, maxPlans } from '../src/comparison.js';
import GlyphBackground from '../src/components/GlyphBackground.vue';
import ParameterField from '../src/components/ParameterField.vue';
import GlobalModelField from '../src/components/GlobalModelField.vue';
import AnalysisPanel from '../src/components/AnalysisPanel.vue';
import SummaryCards from '../src/components/SummaryCards.vue';
import SparklesText from '../src/components/SparklesText.vue';
import PlanFlowPreview from './PlanFlowPreview.vue';
import { useHeaderOpacity } from '../src/use-header-opacity.js';
const headerSurfaceOpacity = useHeaderOpacity();
const props = defineProps({ config: Object, results: Array, busy: Boolean, errors: Object, failure: String, canUndo: Boolean });
const emit = defineEmits(['import','export','remember','reset','add','edit','baseline','copy','remove','undo']);
const menu = ref('');
const expanded = ref(new Set());
function togglePlan(id) { const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next; }
watch(() => props.config.plans.map(p=>p.id), ids => {
  expanded.value=new Set([...expanded.value].filter(id=>ids.includes(id)));
  if (!ids.includes(menu.value)) menu.value='';
});
const baselineId = computed(() => resolveBaselineId(props.config, props.results));
const baseline = computed(() => props.results.find(r => r.planId === baselineId.value));
const lowestCost = computed(() => Math.min(...props.results.map(r => r.cost.total)));
const analysisConfig = computed(() => ({...props.config, baselineId:baselineId.value}));
const palette = ['#4b7160','#8c91a0','#9a80aa','#bd945e','#6792a5','#ab7e88','#8f984c','#788ca3'];
const shortName = name => name.replace('百炼 · ', '').replace(' · 固定价格', '');
const m = n => '$' + Number(n || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const n = value => Number(value || 0).toLocaleString('en-US',{maximumFractionDigits:2});
const pct = value => value == null ? '—' : (value * 100).toFixed(1) + '%';
function closeMenu(restoreFocus = false) {
  const id = menu.value;
  menu.value = '';
  if (restoreFocus) document.getElementById('plan-menu-trigger-' + id)?.focus();
}
async function openMenu(id, last = false) {
  menu.value = id;
  await nextTick();
  const items = document.getElementById('plan-menu-' + id)?.querySelectorAll('button:not(:disabled)');
  (last ? items?.[items.length - 1] : items?.[0])?.focus();
}
function moveMenuFocus(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
  const index = items.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}
function dismissMenu(event) {
  if (menu.value && !document.getElementById('plan-menu-trigger-' + menu.value)?.parentElement.contains(event.target)) closeMenu();
}
onMounted(() => {
  document.addEventListener('pointerdown', dismissMenu);
  document.addEventListener('focusin', dismissMenu);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissMenu);
  document.removeEventListener('focusin', dismissMenu);
});
function action(type,id) { closeMenu(true);emit(type,id); }
</script>

<template>
  <div class="restored-home">
    <GlyphBackground />
    <header class="app-header" :style="{ '--header-surface-opacity': headerSurfaceOpacity }">
      <a class="brand" href="./design.html"><span class="brand-mark header-floating"><img src="/token-lab.svg" width="36" height="36" alt="" /></span><strong><b class="brand-title header-floating">Token Lab</b><span class="brand-tagline header-floating">A LITTLE CLARITY FOR EVERY TOKEN</span></strong></a>
      <nav class="header-actions" aria-label="配置操作"><a class="header-github header-floating" href="https://github.com/zhangHongEn/token-lab" target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开 GitHub 仓库"><Github :size="16" /><span>GitHub</span></a><button class="header-floating" @click="emit('import')"><Upload :size="15"/><span>导入配置</span></button><button class="header-floating" :disabled="!!Object.keys(errors).length" @click="emit('export')"><Download :size="15"/><span>导出配置</span></button></nav>
    </header>
    <div class="workspace comparison-workspace"><main>
      <h1 class="sr-only">Token Lab · 会话成本实验室</h1>
      <section class="global-settings" aria-labelledby="global-settings-title">
        <div><h2 id="global-settings-title"><SlidersHorizontal :size="17"/>全局配置</h2><p>各方案默认使用以下数值，也可在方案内单独设置。</p></div>
        <div class="global-settings-fields" @focusin="emit('remember')">
          <GlobalModelField :config="config" :error="errors.globalModelId" />
          <ParameterField v-for="field in globalFields.filter(([key]) => !key.startsWith('compression'))" :key="field[0]" :object="config.globalSimulation" :field="field" :error="errors['globalSimulation.' + field[0]]"/>
          <label class="field"><span>压缩阈值类型</span><select v-model="config.globalSimulation.compressionThresholdType" aria-label="压缩阈值类型"><option value="TURN">用户轮次</option><option value="TOKEN">上下文</option></select></label>
          <ParameterField :key="thresholdField(config.globalSimulation)[0]" :object="config.globalSimulation" :field="thresholdField(config.globalSimulation)" :error="errors['globalSimulation.' + thresholdField(config.globalSimulation)[0]]"/>
        </div>
      </section>
      <div class="results-heading comparison-heading"><div><h2>对比方案 <span class="plan-count">{{ config.plans.length }}/8</span></h2></div><div class="plan-toolbar"><button @click="emit('reset')"><RotateCcw :size="14"/>恢复默认方案</button><button class="primary-button" :disabled="config.plans.length>=8" @click="emit('add')"><Plus :size="15"/>新增方案</button></div></div>
      <div v-if="Object.keys(errors).length || failure" class="error-box" role="alert">{{ Object.values(errors)[0] || failure }}</div>
      <div class="comparison-table-wrap" :aria-busy="busy">
        <table class="comparison-table"><thead><tr><th>方案 / 模型</th><th>会话总费用</th><th>相对基准</th><th>初始上下文</th><th>模型请求</th><th title="用户消息总轮数 ÷ 实际压缩次数；包含末次压缩后尚未再次触发压缩的用户轮次。">上下文压缩</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>
          <template v-for="(r,i) in results" :key="r.planId">
          <tr class="plan-summary-row" :class="{'row-expanded':expanded.has(r.planId)}">
            <td><div class="plan-identity"><button class="row-expand-button" :aria-label="(expanded.has(r.planId)?'收起':'展开')+'方案详情 '+r.planName" :aria-expanded="expanded.has(r.planId)" :aria-controls="'plan-detail-'+r.planId" @click="togglePlan(r.planId)"><ChevronDown v-if="expanded.has(r.planId)" :size="15"/><ChevronRight v-else :size="15"/></button><span class="plan-icon" :style="{color:palette[i]}"><Workflow :size="19"/></span><div><button class="plan-title" :aria-expanded="expanded.has(r.planId)" @click="togglePlan(r.planId)"><SparklesText v-if="r.cost.total === lowestCost" :phase="i">{{ r.planName }}</SparklesText><template v-else>{{ r.planName }}</template></button><span v-if="r.planId===baselineId" class="badge">基准</span><small>{{ shortName(r.model.name) }}</small></div></div></td>
            <td class="price-cell">{{ m(r.cost.total) }}<span class="micro">USD</span></td>
            <td><span v-if="r.planId===baselineId" class="muted">—</span><span v-else class="delta" :class="{positive:r.cost.total>baseline.cost.total}"><ArrowDown v-if="r.cost.total<baseline.cost.total" :size="12"/><ArrowUp v-else :size="12"/>{{ baseline.cost.total ? pct(Math.abs(r.cost.total-baseline.cost.total)/baseline.cost.total) : '—' }}</span></td>
            <td>{{ n(r.initialContext) }}<span class="unit">K</span></td>
            <td>{{ r.requests.length }}<span class="unit">次</span></td>
            <td>{{ r.averageUserTurnsPerCompression === null ? '未触发压缩' : `平均 ${n(r.averageUserTurnsPerCompression)} 轮` }}</td>
            <td class="plan-actions-cell">
              <div class="row-actions">
                <button class="plan-action-link" :aria-label="'编辑 '+r.planName" @click="action('edit',r.planId)">编辑</button>
                <div class="plan-menu-anchor" @keydown.esc.stop.prevent="closeMenu(true)">
                  <button :id="'plan-menu-trigger-'+r.planId" class="plan-action-link plan-menu-trigger" :class="{'is-open':menu===r.planId}" :aria-label="r.planName+' 的更多操作'" aria-haspopup="menu" :aria-expanded="menu===r.planId" :aria-controls="menu===r.planId?'plan-menu-'+r.planId:undefined" @click="menu===r.planId?closeMenu():openMenu(r.planId)" @keydown.down.prevent="openMenu(r.planId)" @keydown.up.prevent="openMenu(r.planId,true)">更多<ChevronDown :size="13"/></button>
                  <div v-if="menu===r.planId" :id="'plan-menu-'+r.planId" class="plan-action-menu" role="menu" :aria-label="r.planName+' 的更多操作'" @keydown="moveMenuFocus">
                    <button role="menuitem" tabindex="-1" :disabled="r.planId===baselineId" @click="action('baseline',r.planId)"><Check :size="14"/>{{ r.planId===baselineId?'当前基准':'设为基准' }}</button>
                    <button role="menuitem" tabindex="-1" :disabled="config.plans.length>=maxPlans" :title="config.plans.length>=maxPlans?'最多支持 '+maxPlans+' 个方案':undefined" @click="action('copy',r.planId)"><Copy :size="14"/>复制方案</button>
                    <div class="plan-menu-divider" role="separator"></div>
                    <button class="plan-menu-danger" role="menuitem" tabindex="-1" @click="action('remove',r.planId)"><Trash2 :size="14"/>删除方案</button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
          <tr v-if="expanded.has(r.planId)" class="plan-detail-row"><td colspan="7">
            <div :id="'plan-detail-'+r.planId" class="plan-expanded-content">
              <div class="expanded-cost-card"><SummaryCards :results="results" :config="analysisConfig" :visible-plan-id="r.planId"
                @edit="action('edit',$event)" @copy="action('copy',$event)" @remove="action('remove',$event)" @baseline="action('baseline',$event)" /></div>
              <PlanFlowPreview v-if="config.plans.some(p=>p.id===r.planId)" :plan="config.plans.find(p=>p.id===r.planId)" :global-simulation="config.globalSimulation" @edit="action('edit',$event)" />
            </div>
          </td></tr>
          </template>
        </tbody></table>
        <div v-if="!results.length" class="empty-state">{{ busy?'正在计算会话成本…':'新增一个方案，开始探索成本。' }}</div>
      </div>
      <AnalysisPanel v-if="results.length" :results="results" :config="analysisConfig"/>
      <footer><span class="footer-mark">T / L</span><p>初始前缀按期望命中率计费 · 每轮流程结束后检查压缩 · 最后一轮触发的压缩也计费<br/>所有长度以 K Token 计量。预计费用基于当前参数与费率快照，零分母显示「—」。</p><button v-if="canUndo" class="undo-button" @click="emit('undo')"><RotateCcw :size="13"/>撤销修改</button><span>COMPARE / V4</span></footer>
    </main></div>
  </div>
</template>
