#!/usr/bin/env node
/**
 * a11y.js — Playwright + axe-core accessibility pass for the review-site skill,
 * plus a network-request recorder: true evidence for font origins (including
 * CSS-loaded Google Fonts) and third-party scripts, which HTML regex misses.
 *
 * Requires: npm install && npx playwright install chromium
 * Usage: node a11y.js <url> [url2 url3 ...]
 * Output: a11y-report.json + summary to stdout.
 *
 * axe finds violations; it does not judge quality. Alt-text quality, link-text
 * clarity, focus behavior, and reduced-motion still need the judgment checks
 * in references/accessibility.md.
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { writeFileSync } from "node:fs";

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("Usage: node a11y.js <url> [more urls...]");
  process.exit(1);
}

const browser = await chromium.launch();
// @axe-core/playwright requires pages created from an explicit context —
// browser.newPage() throws "Please use browser.newContext()".
const context = await browser.newContext();
const results = {};

for (const url of urls) {
  const page = await context.newPage();
  const requests = []; // { url, type }
  page.on("request", (req) => requests.push({ url: req.url(), type: req.resourceType() }));

  try {
    let navError = null;
    // "networkidle" is discouraged and never fires on analytics-heavy marketing
    // sites (our exact target). Use "load" + a short settle; on timeout, run
    // axe against whatever rendered rather than erroring out.
    try {
      await page.goto(url, { waitUntil: "load", timeout: 45000 });
    } catch (e) {
      navError = String(e?.message ?? e);
    }
    await page.waitForTimeout(2500);

    // Host from the FINAL url (post-redirect) — on apex→www sites the input host
    // would misclassify the site's own scripts as third-party.
    let pageHost; try { pageHost = new URL(page.url() || url).hostname; } catch { pageHost = new URL(url).hostname; }
    const fontRequests = requests
      .map((r) => r.url)
      .filter((u) => {
        try {
          const p = new URL(u);
          return /fonts\.(googleapis|gstatic)\.com/i.test(p.hostname) || /\.(woff2?|ttf|otf)(\?|#|$)/i.test(p.pathname);
        } catch { return false; }
      });
    const thirdPartyScriptOrigins = [...new Set(
      requests
        .filter((r) => r.type === "script")
        .map((r) => { try { return new URL(r.url); } catch { return null; } })
        .filter((p) => p && p.hostname !== pageHost)
        .map((p) => p.origin)
    )];

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
      .analyze();

    results[url] = {
      navError, // non-null = page never fired load; treat findings as partial
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, html: n.html.slice(0, 200) })),
        nodeCount: v.nodes.length,
      })),
      // extras axe doesn't frame the way our standards do:
      h1Count: await page.locator("h1").count(),
      skipLink: await page.locator('a[href^="#"]:has-text("skip")').count(),
      landmarks: {
        main: await page.locator("main").count(),
        nav: await page.locator("nav").count(),
        footer: await page.locator("footer").count(),
      },
      iframesMissingTitle: await page.locator("iframe:not([title])").count(),
      imagesMissingAlt: await page.locator("img:not([alt])").count(),
      // network evidence:
      googleFontsNetwork: fontRequests.some((u) => /fonts\.(googleapis|gstatic)\.com/i.test(u)),
      fontRequests: [...new Set(fontRequests)].slice(0, 15),
      thirdPartyScriptOrigins,
      requestCount: requests.length,
    };
  } catch (e) {
    results[url] = { error: String(e) };
  } finally {
    await page.close();
  }
}

await context.close();
await browser.close();
writeFileSync("a11y-report.json", JSON.stringify(results, null, 2));

for (const [url, r] of Object.entries(results)) {
  if (r.error) { console.log(`${url}: ERROR ${r.error}`); continue; }
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of r.violations) bySeverity[v.impact] = (bySeverity[v.impact] || 0) + 1;
  console.log(
    `${url}: ${r.violations.length} violation types (critical: ${bySeverity.critical}, serious: ${bySeverity.serious})` +
    ` | h1s: ${r.h1Count} | imgs missing alt: ${r.imagesMissingAlt}` +
    ` | Google Fonts via network: ${r.googleFontsNetwork} | 3P script origins: ${r.thirdPartyScriptOrigins.length}` +
    (r.navError ? " | PARTIAL (load timeout)" : "")
  );
}
console.log("Full evidence written to a11y-report.json — report critical/serious individually, summarize the rest.");
