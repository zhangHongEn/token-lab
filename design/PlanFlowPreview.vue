<script setup>
import { computed } from 'vue';
import { FileText, Cpu, ArrowRight, ArrowDown, Layers, Repeat2, Check, Workflow } from 'lucide-vue-next';
import { resolvePlan } from '../src/comparison.js';
import { resolveStepToken, stepRuntime, tokenFormula } from '../src/session-flow.js';
import { sourceNames } from '../src/session-report.js';
const props = defineProps({ plan: Object, globalSimulation: Object });
defineEmits(['edit']);
const resolved = computed(() => resolvePlan(props.plan, props.globalSimulation));
const simulation = computed(() => resolved.value.simulation);
const format = value => value === null ? '—' : Number(value).toLocaleString('en-US',{maximumFractionDigits:3});
const phases = computed(() => ['initial','turn'].map(key => {
  const steps=simulation.value.flow[key].map((step,index)=>{
    let value=null,error='';
    try {value=resolveStepToken(step.token,simulation.value,stepRuntime(simulation.value.flow,key,index));}catch(e){error=e.message;}
    return {...step,name:sourceNames[step.text]||step.text,value,error,formula:tokenFormula(step.token)};
  });
  const active=steps.filter(s=>s.enabled!==false);
  return {key,steps,active:active.length,calls:active.filter(s=>s.type==='llm').length,total:active.some(s=>s.value===null)?null:active.reduce((sum,s)=>sum+s.value,0)};
}));
</script>

<template>
  <section class="plan-flow-preview" :aria-label="plan.name+' 执行流程'">
    <div class="flow-preview-heading"><div><h3><Workflow :size="16"/>执行流程</h3><p>初始化一次，随后按顺序执行每轮流程。</p></div><button class="flow-edit-link" @click="$emit('edit',plan.id)">编辑流程<ArrowRight :size="13"/></button></div>
    <div class="flow-preview-meta"><div class="flow-key"><span><FileText :size="12"/>追加上下文</span><span><Cpu :size="12"/>调用模型</span></div></div>
    <div class="flow-phase-grid">
      <ArrowRight class="phase-bridge" :size="17" aria-hidden="true"/>
      <section v-for="phase in phases" :key="phase.key" class="preview-phase" :class="phase.key">
        <div class="phase-header"><span class="phase-symbol"><Layers v-if="phase.key==='initial'" :size="16"/><Repeat2 v-else :size="16"/></span><div><h4>{{ phase.key==='initial'?'初始上下文':'每轮流程' }}</h4><small>{{ phase.key==='initial'?'会话开始时执行':`重复 ${simulation.turnTotalCount} 轮` }} · {{ phase.active }} 个有效步骤</small></div></div>
        <ol class="preview-flow-nodes" :aria-label="phase.key==='initial'?'初始上下文步骤':'每轮执行步骤'">
          <li v-for="(step,index) in phase.steps" :key="index" :class="{'model-node':step.type==='llm','node-disabled':step.enabled===false,'node-error':step.error}">
            <div class="preview-node"><span class="node-order">{{ String(index+1).padStart(2,'0') }}</span><span class="node-kind"><Cpu v-if="step.type==='llm'" :size="14"/><FileText v-else :size="14"/></span><div class="node-text"><strong>{{ step.name }}</strong><small>{{ step.enabled===false?'已停用':step.type==='llm'?'模型输出':'追加内容' }}<span v-if="!step.error"> · {{ typeof step.token==='number'?'固定值':'公式' }}</span></small></div><span class="node-value">{{ step.enabled===false?'—':format(step.value) }}<small v-if="step.enabled!==false">K</small></span></div>
            <details v-if="typeof step.token!=='number' || step.error" class="node-expression"><summary>{{ step.error?'查看错误':'查看公式' }}</summary><code>{{ step.formula }}</code><p v-if="step.error" role="alert">{{ step.error }}</p></details>
            <ArrowDown v-if="index<phase.steps.length-1" class="node-arrow" :size="12" aria-hidden="true"/>
          </li>
        </ol>
        <p v-if="!phase.steps.length" class="empty-flow">未配置步骤</p>
        <div class="phase-result"><span>{{ phase.key==='initial'?'初始上下文合计':'本轮新增内容与输出' }}</span><strong>{{ format(phase.total) }}<small>K</small></strong></div>
        <div v-if="phase.key==='initial'" class="initial-exit"><Check :size="13"/><span>上下文就绪，进入每轮流程</span><ArrowRight :size="13"/></div>
        <div v-else class="turn-exit"><span><Layers :size="13"/>检查压缩条件</span><small>{{ simulation.compressionThresholdType==='TURN'?`活跃轮次 ≥ ${simulation.compressionThresholdTurnCount} 轮`:`上下文 ≥ ${format(simulation.compressionThresholdToken)} K` }}</small><div><Repeat2 :size="12"/>下一轮<span>{{ phase.calls }} 次模型调用 / 轮</span></div></div>
      </section>
    </div>
    <p class="flow-preview-footnote">单位 K Token。节点展示当前参数下的内容长度；模型输入包含此前累计上下文，压缩费用另计。</p>
  </section>
</template>
