// Production smoke checks: authenticated frontend GETs and unauthenticated calls to protected routes.
// An authenticated DELETE is only sent after GET confirms that the test UUID does not exist.
const fs = require("node:fs");
const root = require("node:path").resolve(__dirname, "..");
const axios = require(
  root + "/LeonExpress_front/node_modules/axios/dist/node/axios.cjs",
);
const inventory = require(root + "/scripts/audit-api-contracts.cjs");
(async () => {
  const credentials = {
    username: process.env.API_AUDIT_USERNAME,
    password: process.env.API_AUDIT_PASSWORD,
  };
  if (!credentials.username || !credentials.password)
    throw Error(
      "Set API_AUDIT_USERNAME and API_AUDIT_PASSWORD. Credentials are never included in the report.",
    );
  const baseURL = process.env.API_AUDIT_BASE_URL || "https://leonexpress.cl";
  const api = axios.create({
    baseURL,
    timeout: 18000,
    validateStatus: () => true,
  });
  const login = await api.post("/api/auth/login", credentials);
  if (login.status !== 200) throw Error("Login status " + login.status);
  if (login.data.user?.role !== "ADMIN")
    throw Error("The audit requires an ADMIN account.");
  const headers = { Authorization: "Bearer " + login.data.token };
  const jobs = [],
    seen = new Set();
  for (const call of inventory.frontendCalls) {
    const key = call.method + " " + call.path;
    if (seen.has(key)) continue;
    seen.add(key);
    if (call.method === "GET" && !call.path.includes(":"))
      jobs.push({ method: "GET", path: call.path, authenticated: true });
  }
  // A non-existing UUID exercises the delete route and rolls back without changing customer data.
  const deletionPath = "/api/clients/00000000-0000-0000-0000-000000000000";
  const missingClient = await api.get(deletionPath, { headers });
  if (
    missingClient.status === 404 &&
    missingClient.data?.error === "Cliente no encontrado"
  )
    jobs.push({ method: "DELETE", path: deletionPath, authenticated: true });
  else
    throw Error("The deletion probe requires a confirmed non-existing client.");
  for (const route of inventory.backendRoutes) {
    if (route.requiresAuth) {
      const callPath = route.path.replace(
        /:[^/]+/g,
        "00000000-0000-0000-0000-000000000000",
      );
      if (!callPath.startsWith("/api")) continue;
      jobs.push({ method: route.method, path: callPath, authenticated: false });
    }
  }
  const results = [];
  const dataCache = new Map();
  const skipped = [];
  const runJobs = async () => {
    let next = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++],
            started = Date.now();
          try {
            const r = await api.request({
              method: job.method,
              url: job.url || job.path,
              headers: job.authenticated ? headers : {},
              params:
                job.method === "GET"
                  ? {
                      page: 1,
                      pageSize: 5,
                      limit: 5,
                      ...(job.path === "/api/driver/summary"
                        ? { userId: login.data.user.user_id }
                        : {}),
                    }
                  : undefined,
            });
            if (job.authenticated && r.status === 200)
              dataCache.set(job.path, r.data);
            const isJson = String(r.headers["content-type"]).includes("json");
            results.push({
              method: job.method,
              path: job.path,
              authenticated: job.authenticated,
              status: r.status,
              json: isJson,
              ms: Date.now() - started,
              error:
                r.status >= 400
                  ? typeof r.data === "string"
                    ? r.data.slice(0, 160)
                    : r.data?.error || r.data?.message
                  : undefined,
            });
          } catch (e) {
            results.push({
              method: job.method,
              path: job.path,
              authenticated: job.authenticated,
              status: 0,
              error: e.code,
              ms: Date.now() - started,
            });
          }
        }
      }),
    );
  };
  await runJobs();
  jobs.length = 0;
  const first = (endpoint, key) => {
    const data = dataCache.get(endpoint);
    return (
      Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : data?.[key] || []
    )[0];
  };
  const client = first("/api/clients", "clients");
  const pkg = first("/api/packages", "packages");
  const pickup = first("/api/pickups", "pickups");
  const route = first("/api/routes", "routes");
  const invoice = first("/api/invoices", "invoices");
  const payout = first("/api/driver-payouts", "payouts");
  const period = first("/api/billing/periods", "periods");
  const samples = [
    [/^\/api\/clients\//, client?.client_id],
    [/^\/api\/packages\/by-code\//, pkg?.tracking_code],
    [/^\/api\/packages\//, pkg?.package_id],
    [/^\/api\/pickups\//, pickup?.pickup_id],
    [/^\/api\/ml-confirm\/pickups\//, pickup?.pickup_id],
    [/^\/api\/routes\//, route?.route_id],
    [/^\/api\/invoices\//, invoice?.invoice_id],
    [/^\/api\/payouts\//, payout?.payout_id],
    [/^\/api\/billing\/period\//, period?.period_id],
  ];
  const dynamicSeen = new Set();
  for (const call of inventory.frontendCalls) {
    if (
      call.method !== "GET" ||
      !call.path.includes(":") ||
      dynamicSeen.has(call.path)
    )
      continue;
    dynamicSeen.add(call.path);
    const sample = samples.find(([pattern]) => pattern.test(call.path));
    if (sample?.[1])
      jobs.push({
        method: "GET",
        path: call.path,
        url: call.path.replace(/:[^/]+/g, encodeURIComponent(sample[1])),
        authenticated: true,
      });
    else
      skipped.push({
        method: "GET",
        path: call.path,
        reason:
          "Requires a valid invitation token, active batch, or existing sample record.",
      });
  }
  await runJobs();
  const isExpected = (row) =>
    row.json &&
    (row.authenticated
      ? row.method === "DELETE"
        ? row.status === 404
        : row.path === "/api/mercadolibre/my-account"
          ? row.status === 403
          : row.status === 200
      : [401, 403].includes(row.status));
  const failures = results.filter((row) => !isExpected(row));
  const report = {
    generatedAt: new Date().toISOString(),
    baseURL,
    skipped,
    failures,
    results: results.sort(
      (a, b) =>
        (a.authenticated ? "A" : "Z").localeCompare(
          b.authenticated ? "A" : "Z",
        ) || a.path.localeCompare(b.path),
    ),
  };
  fs.writeFileSync(
    process.env.API_AUDIT_OUTPUT || "/tmp/leon-api-live-audit.json",
    JSON.stringify(report, null, 2),
  );
  for (const row of report.results)
    if (row.authenticated || ![401, 403].includes(row.status))
      console.log(JSON.stringify(row));
  console.log(
    JSON.stringify({
      total: results.length,
      authenticated: results.filter((x) => x.authenticated).length,
      anonymous: results.filter((x) => !x.authenticated).length,
      skipped: skipped.length,
      failures: failures.length,
    }),
  );
  if (failures.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
