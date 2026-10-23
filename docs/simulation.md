# 会话模拟与配置参考

[← 返回项目介绍](../README.md)

本文说明 Token Lab 的计费口径、方案配置格式和 Session 接口。

## 计算与展示口径

所有长度参数与 Session 结果均使用 **K Token**（1K = 1,000 Token），模型价格是每百万 Token 单价。费用 = K Token ÷ 1,000 × 单价。

所有预设、手动费率、图表和导出费用统一使用美元（USD），单价显示为 $/M（每百万 Token）。全部模型费率直接以 USD 维护在 `model-pricing.js`。

每个方案拥有独立的参数、流程、模型和费率。默认两套流程分别在每轮查询所需 Schema，或在初始阶段预加载全部 Schema。Session 不区分工具模式，仅按流程数组执行；后续编辑互不影响。初始上下文、缓存命中、压缩触发和保留顺序都由 Session 决定。默认流程中角色允许工具比例只影响允许工具列表长度。每轮流程结束后检查压缩，最后一轮触发的压缩请求也计费。

用户轮次不包括初始上下文和压缩摘要的内部 Turn。压缩请求归入触发它的用户轮次，显示压缩前后长度、删除轮次及保留轮次。摘要输出长度不等于压缩后的总上下文。

“平均每 X 轮用户消息触发一次压缩” = 实际用户消息总轮数 ÷ 实际压缩次数，包含末次压缩后的用户轮次。由 `Session.getConsumptionTokens()` 返回 `averageUserTurnsPerCompression`，未触发压缩时为 `null`，页面显示“未触发压缩”。

输入归因直接读取每次请求的 `actionGroupTokens`，输出归入对应输出 Action 的 group。保留轮次在压缩后的请求中归入“压缩保留轮次”，历史归因不改变。“压缩摘要”是内容来源，“压缩请求费用”是请求分类，两者不可相加。

页面最多支持 8 个方案，每个方案支持 1–1,000 轮，计算在 Worker 中执行，超过 20 秒可减少方案数量、轮次或压缩阈值重试。不会为了提高性能改变 Session 的快照或引用匹配机制。图表采样保留压缩事件和峰值，明细每页 5 个用户轮次。

页面导出 v4 多方案配置，包含全部方案和对比基准；可导入 v4，并兼容 v2 / v3 旧配置。旧模式条件在导入时解析成实际步骤，导出与运行时均不再包含 `toolsMode`。v2 会话配置迁移为两套独立流程。不迁移 v1 旧计算器数据。配置仅使用美元费率，导出和导入均保留费率数值，不会被预设覆盖。编辑模型或价格后标记为自定义费率。首次打开、刷新和恢复默认方案时均选择模型列表第一项，当前为百炼 Qwen3.8 Max；Session 不内置默认费率。配置仅保留在当前页面内存中，需要留存时可导出 JSON。


## 方案管理与比较

- 点击对比卡片上的编辑按钮打开独立草稿编辑窗口，分为基本参数、执行流程、缓存与压缩、模型与费率四区。保存后校验并更新对比；取消、关闭或按 Escape 会丢弃草稿。
- 「新增方案」以默认按需流程开始，并沿用现有方案的模型费率，可切换预加载或空白流程作为起点；「复制」会完整复制选中方案，嵌套配置独立。新增与复制均在保存后加入对比。
- 默认方案也可删除，包括删除全部方案。新增、编辑、删除、切换基准、导入和恢复默认方案均可撤销最近一次操作；关闭通知会清除撤销记录。
- 对比基准默认自动使用总费用最高的方案，同价时使用列表中的首个方案；点击卡片星标可手动固定任意基准，后续修改方案时保留手动选择。删除基准后恢复自动选择；没有方案时基准为 `null`。恢复默认方案会恢复自动选择。
- 概览展示各方案实际用户轮次、模型、总费用和相对基准的差额。单方案展示计算结果；空方案显示新增入口。
- 费用来源使用堆叠条形图和动态费用列，按来源名称对应的 key 对齐，缺失来源计为零。趋势图与请求明细支持全部方案。
- 对比要求使用同一币种，不自动换汇。轮次数不同会提示比较口径；基准费用为零时差额比例显示「—」。
- 配置为 `{ version: 4, unit: "K", baselineId, baselineMode, plans }`；`baselineMode` 为 `auto` 或 `manual`，未提供时保留导入配置的基准选择。每项包含 `id`、`name`、`color`、`simulation`、`model`、`pricing`。方案 ID 和名称需唯一。
- 方案配置仅存于页面内存；可通过 JSON 保留配置，通过 CSV 导出包含真实方案名称的请求或费用来源。


## 自定义会话流程

编辑窗口的「执行流程」可分别编辑初始上下文与每轮流程：新增、复制、删除、改名、调整顺序、启用 / 停用，以及设置固定 Token 或公式。支持撤销最近一次步骤删除，切换编辑分区不会清除该记录；更换流程模板会清除。配置导出会包含完整流程。

直接调用 Session 时使用 `config.flow.initial` 和 `config.flow.turn`；页面 v4 JSON 中位于 `plans[i].simulation.flow`（旧 v2 为 `simulation.flow`）。不提供流程或省略某个阶段时使用该阶段默认流程，显式传入 `[]` 表示空流程。步骤仅支持 `type`、`text`、`token`、`enabled`，未知字段会被拒绝。之前不含 `flow` 的 v2 配置仍可导入。

```js
import Session from "./src/session.js";

const session = new Session({
  turnTotalCount: 10,
  model: { inputCachedPrice: 1.5, inputNotCachedPrice: 12, outputPrice: 36 },
  flow: {
    initial: [
      { type: "action", text: "系统提示", token: "initialContext.agentPromptToken" },
      { type: "action", text: "业务背景", token: 2 },
      {
        type: "action",
        text: "工具定义",
        token: "toolsTotalCount * toolSchemaToken",
      },
    ],
    turn: [
      { type: "action", text: "用户提问", token: "userMessageToken" },
      { type: "llm", text: "检索计划", token: 0.2 },
      { type: "action", text: "检索结果", token: "Math.ceil(toolResultToken * turnAvgToolsCount)" },
      { type: "llm", text: "最终回复", token: "agentResult" },
    ],
  },
});
session.reset();
const totals = session.getConsumptionTokens();
```

| 步骤字段 | 含义 |
|---|---|
| `type` | `action` 追加上下文；`llm` 请求当前有效上下文，并将输出追加到上下文。初始阶段只接受 `action`。 |
| `text` | 非空名称，同时作为费用归因来源；相同名称合并统计。 |
| `token` | 非负有限数字（K Token）或 JS 数值表达式字符串。兼容旧版非空参数名数组（依次相乘）。`llm` 的 Token 表示输出长度，输入长度自动取当前上下文。 |
| `enabled` | 可选布尔值，`false` 跳过该步骤，默认启用。 |

可引用变量见 `session-flow.js` 的 `tokenParameters`：现有内容长度、Skills / Tools 总数、每轮平均数量、角色允许工具比例以及会话总轮次 `turnTotalCount`。方案参数取当前配置值；长度单位是 K Token，比例使用 0–1。点击「插入变量」打开可搜索列表，查看变量名称、中文说明和当前预览值；选中后插入到原光标位置，或替换原选区。取消或按 Escape 只关闭变量弹框，不丢弃方案草稿。

另外提供两个运行变量：

| 变量 | 规则 |
| --- | --- |
| `turnIndex` | 用户轮次索引，从 0 开始；首轮为 0，压缩不占用轮次索引。 |
| `llmIndex` | 当前步骤前已执行的模型调用数；本轮第一次调用取 0，第二次取 1。普通内容步骤取已完成调用数，每轮重置，停用调用不计数。 |

初始阶段两者均为 0。每轮流程可指定预览 `turnIndex`，编辑器按步骤顺序计算 `llmIndex`；预览不会改变会话轮数。保存校验使用首轮索引，执行时逐步求值；若后续轮次得到无效结果，计算会停止并报告具体步骤、`turnIndex` 和 `llmIndex`。

长度设置提供两种方式：

- **固定 Token**：直接输入非负长度。
- **公式**：输入单个 JavaScript 数值表达式，无需 `return`；输入时预览结果，保存前验证。切换方式会保留各自输入。

```js
// 单个工具返回长度 × 每轮工具数
"toolResultToken * turnAvgToolsCount"
// 向上取整（取整单位也是 K Token）
"Math.ceil(toolResultToken * turnAvgToolsCount)"
// 限制最大长度为 10K Token
"Math.min(toolResultToken * turnAvgToolsCount, 10)"
// 按数量分支
"turnAvgToolsCount > 0 ? toolResultToken * turnAvgToolsCount : 0"
// 输出随用户轮次增长
"agentResult * (turnIndex + 1)"
// 区分轮内模型调用
"llmIndex === 0 ? readSkillPlanToken : agentResult"
```

支持算术 `+ - * / % **`、括号、比较 `> >= < <= == != === !==`、逻辑 `! && || ??` 和三元表达式 `条件 ? 值1 : 值2`。函数包括 `Math.min/max/ceil/floor/round/trunc/abs/sqrt/pow/log/log2/log10/exp`，常量包括 `Math.PI` 和 `Math.E`。公式结果必须是非负有限数字；未知变量、无效语法、负值或非有限结果会提示错误并阻止保存。

公式由 Acorn 解析后，仅解释上述数值语法；不使用 `eval` 或 `Function`，不允许赋值、函数定义、全局对象、随机数、网络或任意属性访问。每条公式最多 2,000 字符、256 个求值节点、32 层嵌套。流程仍为可导入导出及传入 Worker 的纯 JSON 数据，旧参数名字符串及参数乘积数组继续兼容。

轮次通过 `kind`（`initial` / `user` / `compression`）区分，不依赖步骤名称。每次 `startNewTurn()` 算一轮，即使没有用户消息步骤或模型调用，也会在轮末检查压缩。Token 阈值包含最后一次模型调用之后追加的内容。初始上下文的引用在本次运行中保持稳定，`reset()` 会按最新参数和流程重新创建初始上下文。


## 基准

以下数据来自仓库测试的固定参数与费率，用于验证计算一致性，不代表通用节省比例或实时模型报价。

将 Session 轮次设为 10、Skills 总数设为 1，其他参数不变：

| 方案 | 普通请求 / 压缩请求 | 最终上下文 K | 费用 USD |
|---|---:|---:|---:|
| 按需 | 40 / 1 | 25.799 | 6.12874995 |
| 全量 | 30 / 1 | 69.969 | 8.18847795 |

费用采用列表第一个模型（百炼 Qwen3.8 Max）的单价 1.5 / 12 / 36 USD 每百万 Token（依次为命中输入、未命中输入、输出）。


### 全局参数与方案覆盖

`globalSimulation` 保存用户轮次、Skills / Tools 总数、Prefix 命中率、压缩阈值类型及两种压缩阈值。`useGlobal` 按字段记录是否继承；新方案默认全部继承。计算、校验和草稿预览均使用实际生效的值。

命中率在配置中为 0–1，页面显示为 0–100%。压缩方式为 `TURN` 或 `TOKEN`，页面仅显示当前方式的阈值（轮 / K Token），切换方式时保留两种阈值。方式和阈值可以分别覆盖，轮次阈值仍必须大于该方案的保留轮次。

旧配置新增全局控制时补齐其展示初值，但没有继承标记的方案字段继续使用原独立值，避免导入后改变模拟结果。
