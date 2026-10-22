#!/usr/bin/env node
// Read-only inventory: compares frontend HTTP calls with mounted Express routes.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../LeonExpress_front/node_modules/typescript");
const {
  parse,
} = require("../LeonExpress_front/node_modules/@vue/compiler-sfc");
const root = path.resolve(__dirname, "..");
const verbs = new Set(["get", "post", "put", "patch", "delete"]);
function source(file) {
  let text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".vue")) {
    const { descriptor } = parse(text);
    text = [descriptor.script?.content, descriptor.scriptSetup?.content]
      .filter(Boolean)
      .join("\n");
  }
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}
function walk(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => walk(child, callback));
}
function literal(node) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return (
      node.head.text +
      node.templateSpans
        .map(
          (span, i) =>
            (span.expression.getText() === "BASE_URL" ? "/api" : `:arg${i}`) +
            span.literal.text,
        )
        .join("")
    );
  return null;
}
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );
}
const backend = [];
function readRouter(file, prefix, visited = new Set()) {
  const key = file + prefix;
  if (visited.has(key)) return;
  visited.add(key);
  const ast = source(file),
    imports = new Map();
  let routerRequiresAuth = false;
  walk(ast, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(ast) === "router" &&
      node.expression.name.text === "use" &&
      node.arguments.some((arg) =>
        /^(authenticateToken|authMiddleware)$/.test(arg.getText(ast)),
      )
    )
      routerRequiresAuth = true;
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(ast) === "require"
    ) {
      const relative = literal(node.initializer.arguments[0]);
      if (relative?.startsWith("."))
        imports.set(
          node.name.getText(ast),
          path.resolve(path.dirname(file), relative) + ".js",
        );
    }
  });
  walk(ast, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression)
    )
      return;
    const owner = node.expression.expression.getText(ast),
      method = node.expression.name.text,
      route = literal(node.arguments[0]);
    if (!["router", "app"].includes(owner) || route === null) return;
    const full = (prefix + route).replace(/\/$/, "") || "/";
    if (verbs.has(method))
      backend.push({
        method: method.toUpperCase(),
        path: full,
        requiresAuth:
          routerRequiresAuth ||
          node.arguments.some((arg) =>
            /^(authenticateToken|authMiddleware)$/.test(arg.getText(ast)),
          ),
        file: path.relative(root, file),
        line: ast.getLineAndCharacterOfPosition(node.pos).line + 1,
      });
    if (method === "use")
      for (const arg of node.arguments.slice(1)) {
        const imported = imports.get(arg.getText(ast));
        if (imported && fs.existsSync(imported))
          readRouter(imported, full, visited);
      }
  });
}
readRouter(path.join(root, "LeonExpress_back/app.js"), "");
const frontend = [];
for (const file of files(path.join(root, "LeonExpress_front/src")).filter((f) =>
  /\.(vue|ts|js)$/.test(f),
)) {
  const ast = source(file);
  walk(ast, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression)
    )
      return;
    const method = node.expression.name.text,
      route = literal(node.arguments[0]);
    if (!verbs.has(method) || !route?.startsWith("/") || route.startsWith("//"))
      return;
    frontend.push({
      method: method.toUpperCase(),
      path:
        (route.startsWith("/api/") ? "" : "/api") +
        route.split("?")[0].replace(/\/$/, ""),
      file: path.relative(root, file),
      line: ast.getLineAndCharacterOfPosition(node.pos).line + 1,
    });
  });
}
function canonical(route) {
  return route.replace(/:[^/]+/g, ":param");
}
const uniqueBackend = [
  ...new Map(
    backend.map((r) => [r.method + " " + canonical(r.path), r]),
  ).values(),
];
const calls = frontend.map((call) => ({
  ...call,
  matched: uniqueBackend.some(
    (route) =>
      route.method === call.method &&
      canonical(route.path) === canonical(call.path),
  ),
}));
const report = {
  generatedAt: new Date().toISOString(),
  frontendCalls: calls,
  backendRoutes: uniqueBackend,
  missing: calls.filter((call) => !call.matched),
};
if (require.main === module && process.argv.includes("--json"))
  console.log(JSON.stringify(report, null, 2));
else if (require.main === module) {
  console.log(
    `${calls.length} frontend call sites; ${uniqueBackend.length} mounted backend routes; ${report.missing.length} unmatched call sites.`,
  );
  for (const call of report.missing)
    console.log(`${call.method} ${call.path} (${call.file}:${call.line})`);
}
module.exports = report;
if (
  require.main === module &&
  process.argv.includes("--check") &&
  report.missing.length
)
  process.exitCode = 1;
