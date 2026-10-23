<script setup>
import { useId } from "vue";
import { CircleHelp } from "lucide-vue-next";
defineProps({ text: String });
const tooltipId = useId();
</script>

<template>
  <span class="field-hint">
    <button type="button" class="field-hint-trigger" aria-label="查看字段说明" :aria-describedby="tooltipId" @click.prevent><CircleHelp :size="13" aria-hidden="true" /></button>
    <span :id="tooltipId" class="field-hint-tooltip" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.field-hint { display: inline-flex; position: relative; vertical-align: middle; margin-left: 5px; }
.field-hint .field-hint-trigger { display: inline-flex; align-items: center; justify-content: center; min-height: 18px; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #89919c; cursor: help; }
.field-hint .field-hint-tooltip { display: none; position: absolute; z-index: 30; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); width: 280px; max-width: 80vw; padding: 10px 12px; border: 1px solid #e4e7ed; border-radius: 7px; background: #fff; box-shadow: 0 4px 18px #18203915; color: #515d70; font-size: 12px; font-weight: 400; line-height: 1.7; white-space: normal; text-align: left; }
.field-hint:hover .field-hint-tooltip, .field-hint:focus-within .field-hint-tooltip { display: block; }
</style>
