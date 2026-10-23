export const number = value => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
export const token = value => value == null ? "—" : number(value) + "K";
export const percent = value => value == null ? "—" : (value * 100).toFixed(1) + "%";
export function money(value, currency = "$", precise = false) {
  if (value == null) return "—";
  if (value === 0) return currency + "0";
  const magnitude = Math.abs(value);
  const amount = magnitude < 1e-8 ? value.toExponential(3) : value.toLocaleString("en-US", {
    minimumFractionDigits: precise ? 8 : 2,
    maximumFractionDigits: precise || magnitude < 0.01 ? 8 : magnitude < 1 ? 5 : 4,
  });
  return currency + amount;
}
export function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value) {
  const safe = String(value ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""');
  return '"' + safe + '"';
}
export const roundRange = rounds => !rounds.length ? "无" : rounds.length === 1 ? "第 " + rounds[0] + " 轮" : "第 " + rounds[0] + "–" + rounds.at(-1) + " 轮";
