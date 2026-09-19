import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const [{ text: moduleText }] = (await build({
  bundle: true,
  entryPoints: [new URL("../src/storage.ts", import.meta.url).pathname],
  format: "esm",
  platform: "browser",
  write: false,
})).outputFiles;

const {
  deleteConnection,
  loadAssessment,
  parseStoredConnection,
  saveConnection,
} = await import(`data:text/javascript;base64,${Buffer.from(moduleText).toString("base64")}`);

test("stored connections accept tagged values and legacy Gateway strings", () => {
  assert.deepEqual(parseStoredConnection("vck_legacy"), { provider: "vercel-gateway", apiKey: "vck_legacy" });
  assert.deepEqual(parseStoredConnection({ provider: "typesafe-direct", apiKey: "ts_key" }), { provider: "typesafe-direct", apiKey: "ts_key" });
  assert.deepEqual(parseStoredConnection({ provider: "typesafe-direct", apiKey: "  ts_key  " }), { provider: "typesafe-direct", apiKey: "ts_key" });
});

test("stored connections fail closed at the credential boundary", () => {
  assert.equal(parseStoredConnection(null), null);
  assert.equal(parseStoredConnection("   "), null);
  assert.equal(parseStoredConnection("x".repeat(513)), null);
  assert.equal(parseStoredConnection({ provider: "unknown", apiKey: "key" }), null);
  assert.equal(parseStoredConnection({ provider: "typesafe-direct", apiKey: "" }), null);
  assert.equal(parseStoredConnection({ provider: "vercel-gateway", apiKey: "x".repeat(513) }), null);
  assert.equal(parseStoredConnection(["vck_key"]), null);
});

test("saving replaces the active connection object and clearing removes it", async () => {
  const session = memoryArea({ "resumeFit.apiKey": "vck_old" });
  const storage = { local: memoryArea(), session };

  await saveConnection(storage, { provider: "typesafe-direct", apiKey: "ts_new" });
  assert.deepEqual(session.values, { "resumeFit.apiKey": { provider: "typesafe-direct", apiKey: "ts_new" } });

  await deleteConnection(storage);
  assert.deepEqual(session.values, {});
});

test("assessment loading exposes only the selected provider", async () => {
  const assessment = await loadAssessment({
    local: memoryArea(),
    session: memoryArea({ "resumeFit.apiKey": "vck_legacy" }),
  });

  assert.deepEqual(assessment.connection, { provider: "vercel-gateway", apiKey: "vck_legacy" });
});

function memoryArea(initial = {}) {
  const values = { ...initial };
  return {
    values,
    async get(keys) {
      if (keys === undefined || keys === null) return { ...values };
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]));
    },
    async set(items) {
      Object.assign(values, items);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    },
  };
}
