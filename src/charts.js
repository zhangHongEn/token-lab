import { displayPlanColor } from "./theme.js";
import { money, token } from "./utils.js";
export const planColors = ["#5869d9", "#d99b61"];
const sourceColors = ["#899681", "#b7a58c", "#91a8a4", "#be795e", "#cbc6b7", "#c4a56b", "#abb898", "#68897c", "#b8b58a", "#9c8a9f", "#bc9294", "#d6ad8f", "#8e674e", "#9ca8ae", "#826f84"];
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export function trendOption(results, metric, currency) {
  const format = ["cost", "cumulativeCost"].includes(metric) ? value => money(value, currency) : token;
  return {
    color: results.map((r, i) => displayPlanColor(r.color ?? planColors[i % planColors.length])),
    animation: false,
    grid: { left: 16, right: 24, top: 48, bottom: 16, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    legend: { type: "scroll", left: 10, right: 10, top: 4, icon: "roundRect", itemWidth: 16, itemHeight: 5, textStyle: { color: "#737d90", fontSize: 11 } },
    tooltip: { trigger: "axis", valueFormatter: format },
    xAxis: { type: "value", min: Math.max(...results.map(r => r.rounds.length)) === 1 ? 0.5 : 1, max: Math.max(...results.map(r => r.rounds.length)) === 1 ? 1.5 : Math.max(...results.map(r => r.rounds.length)), minInterval: 1, axisLabel: { color: "#8790a0", formatter: value => Number.isInteger(value) ? "第 " + value + " 轮" : "" }, axisLine: { lineStyle: { color: "#e3e7ee" } }, splitLine: { show: false } },
    yAxis: { type: "value", axisLabel: { color: "#8790a0", formatter: format }, splitLine: { lineStyle: { color: "#edf0f5", type: "dashed" } } },
    series: results.map((result, planIndex) => {
      const step = Math.max(1, Math.ceil(result.rounds.length / 250));
      const keep = new Set([0, result.rounds.length - 1]);
      let peak = 0;
      result.rounds.forEach((r, i) => {
        if (r[metric] > result.rounds[peak][metric]) peak = i;
        if (r.compression) [i - 1, i, i + 1].forEach(n => keep.add(n));
      });
      keep.add(peak);
      const rows = result.rounds.filter((_, i) => i % step === 0 || keep.has(i));
      return {
        name: result.planName ?? `方案 ${planIndex + 1}`, type: "line", showSymbol: rows.length < 25, symbolSize: 5,
        lineStyle: { width: 2.5 }, emphasis: { focus: "series" },
        data: rows.flatMap(r => metric === "context" && r.compression ? [[r.round, r.beforeCompression], [r.round, r.context]] : [[r.round, r[metric]]]),
        markPoint: {
          symbol: "circle", symbolSize: 8, label: { show: false },
          tooltip: { formatter: p => "第 " + p.data.round + " 轮 · 上下文压缩<br/>点击查看请求明细" },
          data: result.rounds.filter(r => r.compression).map(r => ({ coord: [r.round, r[metric]], round: r.round, planIndex })),
        },
      };
    }),
  };
}

export function sourceOption(results, currency) {
  const sources = new Map();
  results.forEach(result => result.sources.forEach(source => {
    if (source.cost.total > 0) sources.set(source.key, source.name);
  }));
  return {
    animation: false,
    color: sourceColors,
    grid: { left: 12, right: 35, top: 18, bottom: 48, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    legend: { type: "scroll", bottom: 0, left: 10, right: 10, textStyle: { fontSize: 10, color: "#737d90" } },
    tooltip: {
      trigger: "item", confine: true,
      formatter: p => `${escapeHtml(p.name)}<br/>${escapeHtml(p.seriesName ?? "费用")}：${money(p.value, currency, true)}`,
    },
    xAxis: { type: "value", axisLabel: { formatter: v => money(v, currency), color: "#8790a0" }, splitLine: { lineStyle: { color: "#edf0f5", type: "dashed" } } },
    yAxis: { type: "category", inverse: true, data: results.map((r, i) => r.planName ?? `方案 ${i + 1}`), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: "#596477", width: 130, overflow: "truncate" } },
    series: [...sources].map(([key, name]) => ({
      id: key, name, type: "bar", stack: "cost", barMaxWidth: 28,
      emphasis: { focus: "series" },
      data: results.map(result => result.sources.find(source => source.key === key)?.cost.total ?? 0),
    })),
  };
}
