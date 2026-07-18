#!/usr/bin/env node
/**
 * detect.js — platform + review-mode fingerprinting for the review-site skill.
 * Zero dependencies (Node 18+). Usage: node detect.js <url>
 * Prints a JSON report: platform, confidence signals, and staging/production inference.
 * Always exits with JSON — never a raw stack trace.
 */

import { isStagingHost, UA_HEADERS } from "./shared.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node detect.js <url>");
  process.exit(1);
}

const target = url.startsWith("http") ? url : `https://${url}`;

function detectPlatform(html) {
  const signals = [];
  let platform = "unknown";

  if (/data-wf-(page|domain|site)/i.test(html)) signals.push("data-wf-* attributes on <html>");
  if (/website-files\.com/i.test(html)) signals.push("assets served from website-files.com");
  if (/class="[^"]*\bw-(nav|button|container|richtext|embed)\b/i.test(html)) signals.push("w-* utility classes");
  if (signals.length >= 1 && /data-wf-|website-files\.com/i.test(html)) platform = "webflow";

  if (platform === "unknown") {
    if (/<meta[^>]+name=["']generator["'][^>]+content=["']Astro/i.test(html)) {
      platform = "astro";
      signals.push('<meta name="generator" content="Astro">');
    } else if (/astro-island|data-astro-/i.test(html)) {
      platform = "astro";
      signals.push("astro-* attributes / islands");
    } else if (/\/_astro\//.test(html)) {
      // Astro's hashed build-asset dir (analog of Next's /_next/). Catches fully
      // static Astro sites that omit the opt-in generator meta and have no islands.
      platform = "astro";
      signals.push("/_astro/ asset paths");
    }
  }

  if (platform === "unknown") {
    if (/__NEXT_DATA__/.test(html)) {
      platform = "nextjs";
      signals.push("__NEXT_DATA__ script");
    } else if (/\/_next\//.test(html)) {
      platform = "nextjs";
      signals.push("/_next/ asset paths");
    }
  }

  return { platform, signals };
}

/**
 * True only if the `User-agent: *` block disallows everything.
 * Bot-scoped blocks (e.g. a GPTBot-only `Disallow: /`) must NOT count.
 */
function starBlockDisallowsAll(txt) {
  let agents = [];
  let sawRule = false;
  let disallowAll = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const ua = line.match(/^user-agent:\s*(.+)$/i);
    if (ua) {
      if (sawRule) { agents = []; sawRule = false; } // new group starts
      agents.push(ua[1].trim());
      continue;
    }
    const dis = line.match(/^disallow:\s*(.*)$/i);
    if (dis) {
      sawRule = true;
      if (agents.includes("*") && dis[1].trim() === "/") disallowAll = true;
      continue;
    }
    if (/^(allow|sitemap|crawl-delay):/i.test(line)) sawRule = true;
  }
  return disallowAll;
}

function inferMode(targetUrl, html, headers, robotsTxt) {
  const hints = [];
  const host = new URL(targetUrl).hostname;

  if (isStagingHost(host)) hints.push(`host '${host}' matches staging pattern (platform preview domain or staging/dev/preview/test prefix)`);

  const metaNoindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
  if (metaNoindex) hints.push("meta robots noindex present");
  const xRobots = headers.get("x-robots-tag") || "";
  if (/noindex/i.test(xRobots)) hints.push("X-Robots-Tag: noindex header");
  if (robotsTxt && starBlockDisallowsAll(robotsTxt)) hints.push("robots.txt disallows everything for User-agent: *");

  const mode = hints.length > 0 ? "staging (pre-launch review)" : "production (assumed — confirm with user if uncertain)";
  return { mode, hints, metaNoindex };
}

let res, html;
try {
  // 15s timeout — a hanging server must not stall detection (this runs first).
  res = await fetch(target, { redirect: "follow", headers: UA_HEADERS, signal: AbortSignal.timeout(15000) });
  html = await res.text();
} catch (e) {
  console.log(
    JSON.stringify(
      {
        requestedUrl: target,
        error: "FETCH_FAILED",
        detail: (e?.name === "TimeoutError" || e?.name === "AbortError") ? "TIMEOUT" : (e?.cause?.code ?? e?.message ?? String(e)),
        note: "Could not reach the site (DNS/TLS/network). Confirm the URL with the user before reviewing anything.",
      },
      null,
      2
    )
  );
  process.exit(1);
}

let robotsTxt = null;
try {
  const r = await fetch(new URL("/robots.txt", res.url), { redirect: "follow", headers: UA_HEADERS, signal: AbortSignal.timeout(15000) });
  if (r.ok) robotsTxt = await r.text();
} catch {
  /* robots.txt unreachable — reported as null */
}

const { platform, signals } = detectPlatform(html);
const modeInfo = inferMode(res.url, html, res.headers, robotsTxt);

const moduleMap = {
  webflow: "references/platforms/webflow.md",
  astro: "references/platforms/custom-stack.md",
  nextjs: "references/platforms/custom-stack.md",
  unknown: null,
};

console.log(
  JSON.stringify(
    {
      requestedUrl: target,
      finalUrl: res.url,
      status: res.status,
      platform,
      platformSignals: signals,
      loadModule: moduleMap[platform],
      reviewMode: modeInfo.mode,
      modeHints: modeInfo.hints,
      robotsTxtFound: robotsTxt !== null,
      note:
        platform === "unknown"
          ? "No platform fingerprint found. Run the core review only and say so in the report — never silently guess."
          : `Announce: '${platform} site detected — applying the ${platform === "webflow" ? "Webflow" : "custom-stack"} module on top of the core review.'`,
    },
    null,
    2
  )
);
