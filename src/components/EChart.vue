<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TooltipComponent,
  TitleComponent,
} from "echarts/components";
import { init, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

use([
  LineChart,
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TooltipComponent,
  TitleComponent,
  CanvasRenderer,
  BarChart
]);

const props = defineProps({ option: { type: Object, required: true } });
const emit = defineEmits(["select"]);
const container = ref(null);
let chart;
let resizeObserver;

onMounted(() => {
  chart = init(container.value, null, { renderer: "canvas" });
  chart.setOption(props.option);
  chart.on("click", event => emit("select", event));
  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(container.value);
});

watch(
  () => props.option,
  (option) => chart?.setOption(option, { notMerge: true }),
  { deep: true },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <div ref="container" class="echart"></div>
</template>
