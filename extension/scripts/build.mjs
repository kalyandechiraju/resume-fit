import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(extensionRoot, "dist");

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });

await build({
  bundle: true,
  entryPoints: {
    background: join(extensionRoot, "src/background.ts"),
    "sidepanel/panel": join(extensionRoot, "src/panel.ts"),
  },
  format: "esm",
  legalComments: "none",
  outdir: outputRoot,
  platform: "browser",
  target: "chrome116",
});

await cp(join(extensionRoot, "static"), outputRoot, { recursive: true });
