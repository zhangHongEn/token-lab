<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Search, X, Plus } from "lucide-vue-next";

const props = defineProps({ variables: Array });
const emit = defineEmits(["select", "close"]);
const dialog = ref(null);
const query = ref("");
const filtered = computed(() => {
  const search = query.value.trim().toLowerCase();
  return props.variables.filter(item => `${item.key} ${item.label} ${item.group}`.toLowerCase().includes(search));
});
onMounted(() => dialog.value.showModal());
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="variable-picker" aria-labelledby="variable-picker-title" @cancel.prevent.stop="emit('close')" @keydown.esc.prevent.stop="emit('close')">
      <header class="variable-picker-heading"><div><h2 id="variable-picker-title">插入变量</h2><p>选择后插入到公式光标处，或替换选中文字。</p></div><button class="icon-button" aria-label="关闭变量列表" @click="emit('close')"><X :size="19" /></button></header>
      <label class="variable-search"><Search :size="16" /><input v-model="query" autofocus type="search" aria-label="搜索变量" placeholder="搜索变量名称或说明…" /></label>
      <div class="variable-picker-list">
        <p class="variable-picker-note">长度单位为 K Token，比例为 0–1。运行变量显示当前步骤的预览值。</p>
        <ul v-if="filtered.length"><li v-for="item in filtered" :key="item.key"><button :aria-label="'插入变量 ' + item.key" @click="emit('select', item.key)"><span><code>{{ item.key }}</code><small>{{ item.label }}</small></span><span class="variable-value"><small>{{ item.group }}</small><strong>{{ item.value }}</strong></span><Plus :size="15" /></button></li></ul>
        <p v-else class="variable-picker-empty" role="status">没有匹配的变量，试试其他名称或说明。</p>
      </div>
      <footer class="variable-picker-footer"><span role="status">{{ filtered.length }} 个变量</span><button @click="emit('close')">取消</button></footer>
    </dialog>
  </Teleport>
</template>
