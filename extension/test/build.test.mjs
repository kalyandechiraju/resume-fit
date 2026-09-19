import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(extensionRoot, "dist");

async function readOutput(path) {
  return readFile(join(outputRoot, path), "utf8");
}

async function outputExists(path) {
  await access(join(outputRoot, path));
}

test("build output satisfies the MV3 shell contract", async () => {
  const manifest = JSON.parse(await readOutput("manifest.json"));
  const html = await readOutput("sidepanel/index.html");
  const css = await readOutput("sidepanel/styles.css");
  const worker = await readOutput("background.js");
  const panel = await readOutput("sidepanel/panel.js");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, "116");
  const expectedIcons = {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  };
  assert.deepEqual(manifest.icons, expectedIcons);
  assert.deepEqual(manifest.action, { default_title: "Open Resume Fit", default_icon: expectedIcons });
  assert.equal("default_popup" in manifest.action, false);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.side_panel.default_path, "sidepanel/index.html");
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "sidePanel", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://ai-gateway.vercel.sh/*"]);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'; connect-src https://ai-gateway.vercel.sh");

  await Promise.all([
    outputExists("background.js"),
    outputExists("sidepanel/panel.js"),
    outputExists("manifest.json"),
    outputExists("sidepanel/index.html"),
    outputExists("sidepanel/styles.css"),
    outputExists("icons/icon-16.png"),
    outputExists("icons/icon-32.png"),
    outputExists("icons/icon-48.png"),
    outputExists("icons/icon-128.png"),
    outputExists("assets/illustration-resume.png"),
    outputExists("assets/illustration-job.png"),
    outputExists("assets/illustration-results.png"),
    outputExists("assets/fonts/dm-sans-latin.woff2"),
    outputExists("assets/fonts/instrument-serif-latin.woff2"),
    outputExists("assets/fonts/instrument-serif-italic-latin.woff2"),
    outputExists("assets/fonts/DM-Sans-LICENSE.txt"),
    outputExists("assets/fonts/Instrument-Serif-LICENSE.txt"),
  ]);

  assert.match(worker, /chrome\.action\.onClicked/);
  assert.match(worker, /chrome\.sidePanel\.open\(\{ windowId: tab\.windowId \}\)/);
  assert.match(worker, /chrome\.scripting\.executeScript/);
  assert.match(html, /<h1\b[^>]*>[^<]+<\/h1>/);
  assert.match(html, /role="status"[^>]*aria-live="polite"/);
  assert.match(html, /icons\/icon-32\.png/);
  assert.match(css, /fonts\/dm-sans-latin\.woff2/);
  assert.match(css, /fonts\/instrument-serif-latin\.woff2/);
  assert.match(html, /<script src="panel\.js" type="module"><\/script>/);
  assert.match(panel, /ai-gateway\.vercel\.sh\/v4\/ai/);
  assert.match(panel, /typesafe-ai\/jev/);
  assert.match(panel, /Analyze another job/);
  assert.match(panel, /assets\/illustration-/);
  assert.match(panel, /Experience match/);
  assert.match(panel, /Skillset match/);
  assert.match(panel, /Responsibility match/);
  assert.match(panel, /Qualifications match/);
  assert.match(panel, /Not specified/);
  assert.match(css, /\.score-ring/);
  assert.match(css, /calc\(var\(--score\) \* 0\.5%\)/);
  assert.match(css, /\.metric-grid/);
  assert.doesNotMatch(panel, /Requirement breakdown/);
  assert.doesNotMatch(panel, /Resume evidence/);
  assert.doesNotMatch(panel, /saveJobDraft/);
  assert.doesNotMatch(html, /<script\s*>/i);
  assert.doesNotMatch(html, /\bon[a-z]+\s*=/i);
  assert.doesNotMatch(html, /(?:https?:|data:|javascript:)/i);
  assert.doesNotMatch(css, /(?:https?:|data:|javascript:)/i);
  assert.doesNotMatch(worker, /(?:https?:|data:|javascript:)/i);
  assert.equal(/\beval\s*\(|\bnew Function\s*\(/.test(panel), false, "panel bundle must not contain dynamic code");
});
