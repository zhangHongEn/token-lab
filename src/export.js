import { ratio } from "./session-report.js";
import { csvCell, downloadFile } from "./utils.js";
export function buildCsv(results, config, kind) {
  const metadata = ["方案", "Token 单位", "币种", "配置与费率快照"];
  const headers = kind === "requests"
    ? ["请求序号", "用户轮次", "阶段", "输入K", "匹配前缀K", "命中K", "未命中K", "输出K", "后续追加内容K", "命中费用", "未命中费用", "输出费用", "总费用", "累计费用"]
    : ["来源", "命中K", "未命中K", "输出K", "命中费用", "未命中费用", "输出费用", "总费用", "占方案总费用"];
  const rows = [[...metadata, ...headers]];
  results.forEach((result, index) => {
    const common = [result.planName ?? `方案 ${index + 1}`, "K", "USD", JSON.stringify(config)];
    const records = kind === "requests" ? result.requests : result.sources;
    records.forEach(row => rows.push([...common, ...(kind === "requests"
      ? [row.id, row.round, row.stage, row.input, row.prefix, row.hit, row.miss, row.output, row.toolResult, row.cost.cached, row.cost.fresh, row.cost.generated, row.cost.total, row.cumulativeCost]
      : [row.name, row.hit, row.miss, row.output, row.cost.cached, row.cost.fresh, row.cost.generated, row.cost.total, ratio(row.cost.total, result.cost.total)])]));
  });
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

export function exportCsv(results, config, kind) {
  downloadFile("token-lab-" + kind + ".csv", buildCsv(results, config, kind), "text/csv;charset=utf-8");
}
