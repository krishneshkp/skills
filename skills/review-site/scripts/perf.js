#!/usr/bin/env node
/**
 * perf.js — Lighthouse diagnostic run for the review-site skill.
 * Runs Lighthouse via npx (downloads on first use). No shell interpolation —
 * the URL is passed as an argv element, never into a shell string.
 *
 * Usage: node perf.js <url>
 * Output: perf-report.json (full Lighthouse JSON) + extracted opportunities to stdout.
 *
 * POSTURE: diagnostic, not gate. Do not score-police. Extract concrete, fixable
 * opportunities and report those as findings; scores are a symptom list.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node perf.js <url>");
  process.exit(1);
}
if (!/^https?:\/\//i.test(url)) {
  console.error("URL must start with http(s)://");
  process.exit(1);
}

// Lighthouse needs a Chrome binary. Machines that only ran the documented
// `npm install && npx playwright install chromium` have Playwright's Chromium,
// not system Chrome — point CHROME_PATH at it when available.
let chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  try {
    const { chromium } = await import("playwright");
    chromePath = chromium.executablePath();
  } catch { /* fall back to whatever Lighthouse finds */ }
}

// Lighthouse 12+ uses import attributes and needs Node >= 18.20 (20+ recommended);
// on older Node fall back to Lighthouse 10, which still emits every audit we read.
const [nodeMaj, nodeMin] = process.versions.node.split(".").map(Number);
const modernNode = nodeMaj > 18 || (nodeMaj === 18 && nodeMin >= 20);
const lhPkg = modernNode ? "lighthouse" : "lighthouse@10";

console.log(`Running Lighthouse via ${lhPkg} (this can take ~60s)...`);
try {
  execFileSync(
    "npx",
    [
      "--yes",
      lhPkg,
      url,
      "--output=json",
      "--output-path=perf-report.json",
      "--only-categories=performance,accessibility,seo",
      "--chrome-flags=--headless --no-sandbox",
      "--quiet",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, ...(chromePath ? { CHROME_PATH: chromePath } : {}) },
    }
  );
} catch {
  console.error(
    `Lighthouse run failed (${lhPkg}, Node ${process.versions.node}). Common causes: no ` +
    `Chrome/Chromium available (run \`npx playwright install chromium\`), Node too old ` +
    `(20+ recommended), or the target blocking headless browsers. Treat performance as ` +
    `NOT VERIFIED in the report — do not guess findings.`
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync("perf-report.json", "utf8"));
const audits = report.audits;

const interesting = [
  "render-blocking-resources", "unsized-images", "uses-responsive-images",
  "modern-image-formats", "offscreen-images", "unused-javascript",
  "unminified-css", "unminified-javascript", "font-display",
  "uses-rel-preconnect", "largest-contentful-paint-element",
  "layout-shifts", "third-party-summary", "dom-size", "prioritize-lcp-image",
];

console.log(`\nScores (context only — NOT findings): perf ${Math.round((report.categories.performance?.score ?? 0) * 100)}, a11y ${Math.round((report.categories.accessibility?.score ?? 0) * 100)}, seo ${Math.round((report.categories.seo?.score ?? 0) * 100)}\n`);
console.log("Fixable opportunities (these ARE findings material):");
for (const id of interesting) {
  const a = audits[id];
  if (!a || a.score === null || a.score >= 0.9) continue;
  const saving = a.details?.overallSavingsMs ? ` (~${Math.round(a.details.overallSavingsMs)}ms)` : "";
  console.log(`- [${id}] ${a.title}${saving}: ${a.displayValue ?? ""}`);
}
console.log("\nFull evidence in perf-report.json (audits[*].details lists the exact assets).");
