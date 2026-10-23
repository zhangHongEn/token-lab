import { parse } from "acorn";

export const formulaFunctions = ["min", "max", "ceil", "floor", "round", "trunc", "abs", "sqrt", "pow", "log", "log2", "log10", "exp"];
const math = Object.fromEntries(formulaFunctions.map(name => [name, Math[name]]));
const constants = { "Math.PI": Math.PI, "Math.E": Math.E };
const binary = {
  "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b,
  "/": (a, b) => a / b, "%": (a, b) => a % b, "**": (a, b) => a ** b,
  "<": (a, b) => a < b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, ">=": (a, b) => a >= b,
  "==": (a, b) => a == b, "!=": (a, b) => a != b,
  "===": (a, b) => a === b, "!==": (a, b) => a !== b,
};
const cache = new Map();
export const maxFormulaLength = 2000;

function pathOf(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && !node.optional && node.property.type === "Identifier") {
    const parent = pathOf(node.object);
    if (parent) return `${parent}.${node.property.name}`;
  }
  return null;
}

// 只解释数值表达式的语法树，不执行输入的 JavaScript 脚本。
function compile(expression) {
  let program;
  try { program = parse(`(${expression}\n)`, { ecmaVersion: 2022 }); }
  catch { throw new SyntaxError("公式语法有误，请检查括号、运算符和参数"); }
  if (program.body.length !== 1 || program.body[0].type !== "ExpressionStatement") throw new SyntaxError("公式只能包含一个表达式");
  const references = new Set();
  let nodes = 0;
  function visit(node, depth = 0) {
    if (++nodes > 256 || depth > 32) throw new RangeError("公式过于复杂，请简化表达式");
    const child = value => visit(value, depth + 1);
    if (node.type === "Literal" && ["number", "boolean"].includes(typeof node.value)) return () => node.value;
    if (["Identifier", "MemberExpression"].includes(node.type)) {
      const path = pathOf(node);
      if (!path) throw new SyntaxError("变量请使用名称或点号访问，如 initialContext.agentPromptToken");
      if (Object.hasOwn(constants, path)) return () => constants[path];
      references.add(path);
      return values => values[path];
    }
    if (node.type === "UnaryExpression" && ["+", "-", "!"].includes(node.operator)) {
      const argument = child(node.argument);
      return values => node.operator === "+" ? +argument(values) : node.operator === "-" ? -argument(values) : !argument(values);
    }
    if (node.type === "BinaryExpression" && Object.hasOwn(binary, node.operator)) {
      const left = child(node.left), right = child(node.right), operation = binary[node.operator];
      return values => operation(left(values), right(values));
    }
    if (node.type === "LogicalExpression" && ["&&", "||", "??"].includes(node.operator)) {
      const left = child(node.left), right = child(node.right);
      return values => node.operator === "&&" ? left(values) && right(values)
        : node.operator === "||" ? left(values) || right(values) : left(values) ?? right(values);
    }
    if (node.type === "ConditionalExpression") {
      const test = child(node.test), yes = child(node.consequent), no = child(node.alternate);
      return values => test(values) ? yes(values) : no(values);
    }
    if (node.type === "CallExpression" && !node.optional) {
      const path = pathOf(node.callee);
      const name = path?.startsWith("Math.") ? path.slice(5) : "";
      if (!Object.hasOwn(math, name)) throw new SyntaxError("公式仅支持列表中的 Math 函数");
      const args = node.arguments.map(child);
      return values => math[name](...args.map(argument => argument(values)));
    }
    throw new SyntaxError("公式仅支持数值、变量、运算符、条件表达式和 Math 函数");
  }
  return { run: visit(program.body[0].expression), references };
}

export function evaluateFormula(expression, variables) {
  if (typeof expression !== "string" || !expression.trim()) throw new TypeError("请输入公式");
  if (expression.length > maxFormulaLength) throw new RangeError(`公式不能超过 ${maxFormulaLength} 个字符`);
  let compiled = cache.get(expression);
  if (!compiled) {
    compiled = compile(expression);
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(expression, compiled);
  }
  for (const path of compiled.references) {
    if (!Object.hasOwn(variables, path)) throw new RangeError(`未知公式变量：${path}`);
    if (!Number.isFinite(variables[path]) || variables[path] < 0) throw new RangeError(`${path} 必须是非负有限数值`);
  }
  const result = compiled.run(variables);
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) throw new RangeError("公式结果必须是非负有限数值（K Token）");
  return result;
}
