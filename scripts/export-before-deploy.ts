#!/usr/bin/env node
/** Write assets/before-you-deploy.html for offline download from the repo. */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBeforeDeployRoadmapPage } from "../src/html/before-deploy-roadmap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "before-you-deploy.html");
writeFileSync(outPath, renderBeforeDeployRoadmapPage({ standalone: true }), "utf8");
console.log(`Wrote ${outPath}`);
