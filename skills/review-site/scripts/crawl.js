#!/usr/bin/env node
/**
 * crawl.js — redirect-aware, sitemap-seeded, concurrent crawler for the review-site skill.
 * Zero dependencies (Node 18+). Regex-based extraction: good enough for QA
 * evidence-gathering; cross-check surprising results manually.
 *
 * Usage:
 *   node crawl.js <url> [maxPages]                   full-site review (default)
 *   node crawl.js <url> --section /blog/ [maxPages]  section review
 *   node crawl.js --pages <url1> <url2> [...]         review exactly these pages
 *   flags (any scope): --concurrency 5   --max-pages 30
 * Output: crawl-report.json + summary to stdout. maxPages caps DEEP analysis only,
 * never status-checking.
 *
 * Coverage model (the skill's core operating concept — exhaustive where cheap,
 * sampled where expensive). Two phases:
 * - Phase 1, exhaustive cheap layer: EVERY in-scope URL is status-checked (broken
 *   links, redirects). Inventory comes from the sitemap FIRST (link-following alone
 *   misses orphan/unlinked pages), plus link discovery. Yields orphanCandidates
 *   (in sitemap, unlinked) and notInSitemap (crawled, absent from sitemap).
 * - Phase 2, sampled rich layer: full per-page extraction (analyzePage) on a
 *   template-spread sample chosen DETERMINISTICALLY from the inventory — core pages
 *   + up to 2 representatives per path cluster — because 300 pages sharing one
 *   template share its structural issues. `pathClusters` is the template map.
 *
 * Scopes are a pure queue/seeding concern — analyzePage never sees scope:
 * - full: seed = start URL + all same-site sitemap URLs; BFS discovery on.
 * - section: same, filtered to pathname under the prefix; off-section links on
 *   reviewed pages are still status-checked, never analyzed.
 * - pages: no discovery; analyze exactly the given URLs; off-site URLs skipped
 *   with a note. Site-level probes still run, wrapped as outsideRequestedScope.
 *
 * Notes:
 * - Fetches run 5-at-a-time (--concurrency, hard cap 8) — polite to the origin.
 * - Every fetch has a 15s timeout; a hanging URL lands in fetchErrors as TIMEOUT.
 * - Origin is re-anchored to the FINAL url after redirects (apex→www etc.),
 *   and both apex and www variants are treated as same-site.
 * - Sitemap indexes (<sitemapindex>) are detected and sub-sitemaps fetched (capped).
 * - Fetch errors (DNS/TLS) are reported separately — they never silently vanish.
 * - Mixed-content scan covers assets only (src= and stylesheet/preload/icon hrefs),
 *   not outbound <a href="http://..."> links.
 */

import { STAGING_HOST_RX } from "./shared.js";
import { writeFileSync } from "node:fs";

// ---- scope-aware argument parsing (zero-dep, back-compatible with `<url> [maxPages]`) ----
const argv = process.argv.slice(2);
let scopeMode = "full";                 // "full" | "section" | "pages"
let sectionPrefixRaw = null;
const requestedPages = [];
const positional = [];
let concurrencyFlag = null;
let maxPagesFlag = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--pages") {
    scopeMode = "pages";
    while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) requestedPages.push(argv[++i]);
  } else if (a === "--section") {
    if (scopeMode !== "pages") scopeMode = "section";
    sectionPrefixRaw = argv[++i] ?? null;
  } else if (a === "--concurrency") {
    concurrencyFlag = parseInt(argv[++i], 10);
  } else if (a === "--max-pages") {
    maxPagesFlag = parseInt(argv[++i], 10);
  } else if (a.startsWith("--")) {
    // unknown flag — ignore and keep going
  } else {
    positional.push(a);
  }
}

const UA = { "user-agent": "review-site-skill/1.0 (+https://krishnesh.com)" };
const withHttp = (u) => (u.startsWith("http") ? u : `https://${u}`);

// Deep-analysis cap — NEVER caps status-checking. Flag > bare-int positional > default 30.
const MAX_PAGES =
  maxPagesFlag != null && !Number.isNaN(maxPagesFlag) ? maxPagesFlag
  : (parseInt(positional[1], 10) || 30);
// Concurrency: default 5, hard cap 8 (be polite to the client's origin).
const CONCURRENCY = Math.min(Math.max(1, concurrencyFlag || 5), 8);

// Section prefix normalized to a leading slash, no trailing slash ("/blog").
const normSectionPrefix =
  scopeMode === "section" && sectionPrefixRaw
    ? "/" + sectionPrefixRaw.replace(/^\/+/, "").replace(/\/+$/, "")
    : null;
const inSection = (pathname) => {
  if (!normSectionPrefix || normSectionPrefix === "/") return true;
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === normSectionPrefix || p.startsWith(normSectionPrefix + "/");
};

// Start URL anchors the origin: the first requested page (pages scope) or the positional URL.
const startInput = scopeMode === "pages" ? requestedPages[0] : positional[0];
if (!startInput) {
  console.error(
    "Usage:\n" +
    "  node crawl.js <url> [maxPages]                   full-site review (default)\n" +
    "  node crawl.js <url> --section /blog/ [maxPages]  section review\n" +
    "  node crawl.js --pages <url1> <url2> [...]         review exactly these pages\n" +
    "  flags (any scope): --concurrency 5   --max-pages 30"
  );
  process.exit(1);
}
const startUrl = withHttp(startInput);

async function fetchStatus(url) {
  // Follow redirects manually to record the chain.
  const chain = [];
  let current = url;
  for (let hop = 0; hop < 8; hop++) {
    let res;
    try {
      // 15s timeout — one hanging URL must not stall the whole crawl.
      res = await fetch(current, { redirect: "manual", headers: UA, signal: AbortSignal.timeout(15000) });
    } catch (e) {
      const code = e?.cause?.code ?? e?.code ?? "";
      // Our 15s AbortSignal (TimeoutError) OR undici's own connect/headers/body timeouts.
      const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError" ||
        /timeout|etimedout/i.test(code) || /timeout|aborted/i.test(e?.message || "");
      return { status: "FETCH_ERROR", error: timedOut ? "TIMEOUT" : (code || e?.message || String(e)), redirectChain: chain };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      chain.push({ url: current, status: res.status });
      current = new URL(res.headers.get("location"), current).href;
      try { await res.body?.cancel(); } catch { /* drop the redirect body */ }
      continue;
    }
    return { status: res.status, finalUrl: current, redirectChain: chain, headers: res.headers, res };
  }
  return { status: "REDIRECT_LOOP_OR_LONG_CHAIN", redirectChain: chain };
}

// Bounded-concurrency runner for a fixed list of items (fetches stay polite).
async function pool(items, worker, concurrency) {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) || 0 }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx], idx); }
  });
  await Promise.all(runners);
}

// ---- anchor the origin on the final URL, not the input URL ----
const first = await fetchStatus(startUrl);
if (typeof first.status !== "number" || first.status >= 400 || !first.res) {
  const err = {
    requestedUrl: startUrl,
    error: first.status,
    detail: first.error ?? null,
    redirectChain: first.redirectChain ?? [],
    note: "Start URL unreachable or erroring — nothing was crawled. Confirm the URL with the user.",
  };
  writeFileSync("crawl-report.json", JSON.stringify(err, null, 2));
  console.error(`Could not crawl ${startUrl}: ${first.status}. Details in crawl-report.json.`);
  process.exit(1);
}
try { await first.res?.body?.cancel(); } catch { /* drop the anchor body */ }
const origin = new URL(first.finalUrl);
const apexHost = origin.hostname.toLowerCase().replace(/^www\./, "");
const sameSite = (hostname) => {
  const h = hostname.toLowerCase();
  return h === apexHost || h === `www.${apexHost}`;
};

const rx = {
  title: /<title[^>]*>([\s\S]*?)<\/title>/i,
  metaBy: (name) =>
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i"),
  canonical: /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  // Both attribute orders — Webflow emits href BEFORE rel on icon links.
  favicon: /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  webclip: /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
  lang: /<html[^>]+lang=["']([^"']+)["']/i,
  hrefs: /<a\s[^>]*href=["']([^"']*)["']/gi,
  jsonld: /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  scriptSrc: /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  linkTag: /<link\b[^>]*>/gi,
};

function extractMeta(html, name) {
  const m = html.match(rx.metaBy(name));
  return m ? (m[1] ?? m[2] ?? "").trim() : null;
}

const ANALYTICS_RX =
  /googletagmanager\.com\/(gtm\.js|gtag\/js)|google-analytics\.com|plausible\.io\/js|posthog|cdn\.segment\.com|clarity\.ms|static\.hotjar\.com|snap\.licdn\.com|connect\.facebook\.net/i;

// Scanned against the FULL markup only to spot SERIOUS defects in analytics that
// ALREADY exists (e.g. the same tag included twice → double-counted events) — never
// to judge whether analytics is present or "justified". Whether analytics is missing
// is out of scope; verifying it actually fires is a roadmap item. Analytics loaders
// are usually inline snippets (GTM, PostHog, reb2b…) and never appear as <script src>;
// network-level truth lives in a11y thirdPartyScriptOrigins.
const ANALYTICS_DOMAINS = [
  "googletagmanager.com", "google-analytics.com", "plausible.io", "posthog",
  "segment.com", "clarity.ms", "hotjar.com", "snap.licdn.com",
  "connect.facebook.net", "intellimize.co",
];

const SECRET_PATTERNS = [
  /sk_(?:live|test)_[A-Za-z0-9]{10,}/g,
  /AIza[0-9A-Za-z_\-]{30,}/g,
  /(?:api[_-]?key|apikey|client[_-]?secret|access[_-]?token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-.]{24,}["']/gi,
];

function analyzePage(url, html) {
  const anchorTags = [...html.matchAll(/<a\s[^>]*>/gi)].map((m) => m[0]);
  const links = [...html.matchAll(rx.hrefs)].map((m) => m[1]);
  const jsonldBlocks = [...html.matchAll(rx.jsonld)].map((m) => m[1]);
  const jsonldValid = jsonldBlocks.map((b) => {
    try { JSON.parse(b); return true; } catch { return false; }
  });
  const jsonldTypes = jsonldBlocks.flatMap((b) => {
    try {
      const data = JSON.parse(b);
      return (Array.isArray(data) ? data : [data]).map((d) => String(d?.["@type"] ?? "")).filter(Boolean);
    } catch { return []; }
  });

  const scripts = [...html.matchAll(rx.scriptSrc)].map((m) => ({
    src: m[1],
    async: /\basync\b/i.test(m[0]),
    defer: /\bdefer\b/i.test(m[0]),
  }));
  const linkTags = [...html.matchAll(rx.linkTag)].map((m) => m[0]);
  const stylesheets = linkTags
    .filter((t) => /rel=["'][^"']*stylesheet/i.test(t))
    .map((t) => t.match(/href=["']([^"']+)["']/i)?.[1])
    .filter(Boolean);

  // Mixed content: ASSETS only. Outbound <a href="http://..."> is not mixed content.
  const httpAssets = [...html.matchAll(/\bsrc=["'](http:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  for (const t of linkTags) {
    if (/rel=["'][^"']*(stylesheet|preload|icon|apple-touch-icon)/i.test(t)) {
      const h = t.match(/href=["'](http:\/\/[^"']+)["']/i);
      if (h) httpAssets.push(h[1]);
    }
  }

  // Head scripts without defer/async (approximation: everything before </head>)
  const headHtml = html.split(/<\/head>/i)[0] ?? "";
  const headScriptsMissingDeferAsync = [...headHtml.matchAll(rx.scriptSrc)]
    .filter((m) => !/\basync\b/i.test(m[0]) && !/\bdefer\b/i.test(m[0]))
    .map((m) => m[1])
    .slice(0, 10);

  // Heuristic secret scan over inline scripts — leads to confirm, not verdicts.
  const inlineJs = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .join("\n");
  const secretShapedStrings = SECRET_PATTERNS.flatMap((p) =>
    [...inlineJs.matchAll(p)].map((m) => m[0].slice(0, 28) + "…")
  ).slice(0, 5);

  const analyticsSrcs = scripts.map((s) => s.src).filter((s) => ANALYTICS_RX.test(s));

  // Stray text nodes in <head> (paste errors around custom-code embeds) — browsers
  // hoist them into the body, so they render on the page.
  const strayHeadText = headHtml
    .replace(/^[\s\S]*?<head[^>]*>/i, "")
    .replace(/<(script|style|title|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .trim()
    .slice(0, 120);

  // Unresolved {{…}} template bindings in visible markup — crawlers and social
  // scrapers see them even when JS swaps them at runtime. Year tokens ({{Year}}) are
  // split out: that's the intentional dynamic-copyright-year technique, so it's an
  // advisory suggestion at most, never a placeholder-text blocker.
  const visibleHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const allPlaceholders = [...visibleHtml.matchAll(/\{\{[^{}]{1,40}\}\}/g)].map((m) => m[0]);
  const dynamicYearPlaceholder = allPlaceholders.some((p) => /year/i.test(p));
  const placeholderPatterns = allPlaceholders.filter((p) => !/year/i.test(p)).slice(0, 5);

  return {
    title: html.match(rx.title)?.[1]?.trim() ?? null,
    titleLength: html.match(rx.title)?.[1]?.trim().length ?? 0,
    metaDescription: extractMeta(html, "description"),
    metaRobots: extractMeta(html, "robots"),
    ogTitle: extractMeta(html, "og:title"),
    ogDescription: extractMeta(html, "og:description"),
    ogImage: extractMeta(html, "og:image"),
    ogImageIsAbsolute: /^https?:\/\//.test(extractMeta(html, "og:image") ?? ""),
    twitterCard: extractMeta(html, "twitter:card"),
    canonical: (html.match(rx.canonical) || [])[1] ?? (html.match(rx.canonical) || [])[2] ?? null,
    favicon: (html.match(rx.favicon) || [])[1] ?? (html.match(rx.favicon) || [])[2] ?? null,
    webclip: (html.match(rx.webclip) || [])[1] ?? (html.match(rx.webclip) || [])[2] ?? null,
    htmlLang: html.match(rx.lang)?.[1] ?? null,
    htmlBytes: Buffer.byteLength(html),
    // Exclude links that are PROVABLY hidden from static markup: Webflow's
    // w-condition-invisible (unset CMS fields), the `hidden` attribute, and inline
    // display:none. Class-based hiding (e.g. `.hide`) can't be proven without CSS —
    // the judgment layer verifies those against the rendered page instead.
    hashOnlyLinks: anchorTags.filter(
      (t) =>
        /href=["']#["']/.test(t) &&
        !t.includes("w-condition-invisible") &&
        !/\shidden[\s>=]/i.test(t) &&
        !/style=["'][^"']*display:\s*none/i.test(t)
    ).length,
    scripts: scripts.slice(0, 40),
    stylesheets: stylesheets.slice(0, 15),
    headScriptsMissingDeferAsync,
    jqueryScriptCount: scripts.filter((s) => /jquery/i.test(s.src)).length,
    analyticsScripts: analyticsSrcs,
    duplicateAnalyticsScripts: analyticsSrcs.filter((s, i, a) => a.indexOf(s) !== i),
    analyticsSignalsInMarkup: ANALYTICS_DOMAINS.filter((d) => html.includes(d)),
    googleFontsInMarkup: /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), // markup-level only; network-level evidence lives in a11y-report.json fontRequests
    mixedContentAssets: origin.protocol === "https:" ? httpAssets.slice(0, 10) : [],
    secretShapedStrings,
    defaultishWebflowClasses:
      /class=["'][^"']*\b(?:div-block|heading|text-block|container|link-block|section|columns|grid|image|paragraph)-\d+\b/i.test(html),
    loremIpsum: /lorem ipsum/i.test(html),
    placeholderPatterns,
    dynamicYearPlaceholder,
    strayHeadText,
    // e.g. src=""https://…"" — doubled quotes from a bad custom-code paste.
    malformedAttrQuotes: /=\s*""[^"\s>/]/.test(html),
    // Mutable-branch CDN loads: anyone with push access to that repo controls the site's JS.
    unpinnedGitCdnScripts: scripts
      .map((s) => s.src)
      .filter((s) => /cdn\.jsdelivr\.net\/gh\/[^"']*@(main|master)\b|raw\.githubusercontent\.com/i.test(s)),
    stagingRefs: /\.webflow\.io|\.vercel\.app|localhost:\d+/i.test(html),
    jsonld: {
      blocks: jsonldBlocks.length,
      allValidJson: jsonldValid.every(Boolean),
      duplicateTypes: [...new Set(jsonldTypes.filter((t, i) => jsonldTypes.indexOf(t) !== i))],
    },
    formCount: (html.match(/<form[\s>]/gi) || []).length,
    hasMain: /<main[\s>]/i.test(html),
    hasNav: /<nav[\s>]/i.test(html),
    hasFooter: /<footer[\s>]/i.test(html),
    links: links.slice(0, 200),
  };
}

// ==== inventory: read the sitemap FIRST ====
// The sitemap is the full URL list; link-following alone misses orphan/unlinked
// pages (old landing pages are the classic case). Seed the crawl with it.
const sm = await readSitemap(new URL("/sitemap.xml", origin.href).href);
const sitemapSameSite = sm.urls.filter((u) => {
  try { const x = new URL(u); return sameSite(x.hostname) && /^https?:$/.test(x.protocol); }
  catch { return false; }
});
const sitemapSeeds = sitemapSameSite.filter((u) => {
  try { return scopeMode !== "section" || inSection(new URL(u).pathname); } catch { return false; }
});
const sitemapSeeded = sm.status === 200 && sitemapSameSite.length > 0;

// Deep-sample spread key: collapse an item slug to its path pattern so 300 blog
// posts read as one template. Core pages (depth <= 1) stay their own cluster.
const clusterKey = (pathname) => {
  const segs = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segs.length === 0) return "/";
  if (segs.length === 1) return "/" + segs[0];
  return "/" + segs.slice(0, -1).join("/") + "/*";
};
const isCorePath = (pathname) =>
  pathname.replace(/\/+$/, "").split("/").filter(Boolean).length <= 1;

const STATUS_CAP = 1500;      // polite ceiling on URLs fetched / status-checked
const DEEP_PER_CLUSTER = 2;   // rich-analysis representatives per template
const DISCOVER = scopeMode !== "pages";
const analyzeInScope = (pathname) => (scopeMode === "section" ? inSection(pathname) : true);

// ---- scope-specific seeds (pages scope skips off-site URLs with a note) ----
const skippedOffSiteUrls = [];
let seedUrls;
if (scopeMode === "pages") {
  const uniq = new Set();
  for (const u of requestedPages) {
    let abs; try { abs = new URL(withHttp(u)); } catch { skippedOffSiteUrls.push(u); continue; }
    if (!sameSite(abs.hostname)) { skippedOffSiteUrls.push(u); continue; }
    abs.hash = ""; uniq.add(abs.href);
  }
  seedUrls = [...uniq];
} else {
  seedUrls = [...new Set([origin.href, ...sitemapSeeds])];
}
let statusCheckCapHit = seedUrls.length > STATUS_CAP;
if (statusCheckCapHit) seedUrls = seedUrls.slice(0, STATUS_CAP);

// ======================================================================
// PHASE 1 — exhaustive cheap layer: fetch every in-scope URL (status + link
// discovery). No rich analysis here, so the deep sample chosen in phase 2 is
// identical regardless of concurrency/completion order.
// ======================================================================
const linkStatus = {};
const seen = new Set(seedUrls);
const queue = [...seedUrls];
const htmlPages = new Set();          // in-scope pages fetched OK (deep-analysis candidates)
const pagesWithForms = new Set();     // exhaustive form inventory — Step 3.5 samples from this
const linkedTargets = new Set();      // same-site URLs linked from any crawled page (orphan detection)
const outOfScopeSameSite = new Set(); // same-site links we won't crawl — status-check only
const externalLinks = new Set();

await new Promise((resolve) => {
  let qi = 0, active = 0;
  const done = () => { if (active === 0 && qi >= queue.length) resolve(); };
  const pump = () => {
    while (active < CONCURRENCY && qi < queue.length) {
      const url = queue[qi++];
      active++;
      (async () => {
        const r = await fetchStatus(url);
        linkStatus[url] = { status: r.status, error: r.error, redirectChain: r.redirectChain };
        const isHtml =
          typeof r.status === "number" && r.status < 400 && r.res &&
          (r.res.headers.get("content-type") || "").includes("text/html");
        if (!isHtml) { try { await r.res?.body?.cancel(); } catch { /* no body */ } return; }
        htmlPages.add(r.finalUrl);
        const html = await r.res.text();
        // Exhaustive form inventory (every fetched page, not just the deep sample) —
        // forms are the skill's highest-stakes check, so the sample must include them all.
        if (/<form[\s>]/i.test(html)) pagesWithForms.add(r.finalUrl);
        for (const href of [...html.matchAll(rx.hrefs)].map((m) => m[1])) {
          let abs; try { abs = new URL(href, r.finalUrl); abs.hash = ""; } catch { continue; }
          if (!/^https?:$/.test(abs.protocol)) continue;
          if (!sameSite(abs.hostname)) { externalLinks.add(abs.href); continue; }
          linkedTargets.add(abs.href);
          const enqueue =
            DISCOVER && (scopeMode !== "section" || inSection(abs.pathname)) &&
            !seen.has(abs.href) && seen.size < STATUS_CAP;
          if (enqueue) { seen.add(abs.href); queue.push(abs.href); }
          else if (!seen.has(abs.href)) {
            outOfScopeSameSite.add(abs.href);
            if (DISCOVER && seen.size >= STATUS_CAP) statusCheckCapHit = true;
          }
        }
      })().catch(() => {}).finally(() => { active--; pump(); done(); });
    }
    done();
  };
  pump();
});

// ---- status-check links that point off-scope / off-site (they're on reviewed pages) ----
const extraStatus = [
  ...[...outOfScopeSameSite].slice(0, 300),
  ...[...externalLinks].slice(0, 40),
].filter((u) => !(u in linkStatus));
await pool(extraStatus, async (url) => {
  const r = await fetchStatus(url);
  try { await r.res?.body?.cancel(); } catch { /* no body */ }
  linkStatus[url] = { status: r.status, error: r.error, redirectChain: r.redirectChain };
}, CONCURRENCY);

// ======================================================================
// PHASE 2 — sampled rich layer: pick the deep-review set DETERMINISTICALLY
// from the full inventory (sorted → identical across concurrency), then
// analyze it. Scope is purely a seeding/selection concern; analyzePage stays
// a pure per-page function.
// ======================================================================
const pages = {};
let deepList;
if (scopeMode === "pages") {
  deepList = seedUrls; // exactly the requested same-site pages
} else {
  const candidates = [...htmlPages]
    .filter((u) => { try { return analyzeInScope(new URL(u).pathname); } catch { return false; } })
    .sort();
  const chosen = [];
  const perCluster = new Map();
  for (const u of candidates) {                    // every core page first
    if (isCorePath(new URL(u).pathname)) chosen.push(u);
  }
  for (const u of candidates) {                    // then up to N per template
    const path = new URL(u).pathname;
    if (isCorePath(path)) continue;
    const k = clusterKey(path);
    const c = perCluster.get(k) || 0;
    if (c < DEEP_PER_CLUSTER) { perCluster.set(k, c + 1); chosen.push(u); }
  }
  deepList = chosen.slice(0, MAX_PAGES);
}
let deepCount = 0;
await pool(deepList, async (url) => {
  if (deepCount >= deepList.length) return;        // counter guard (spec §3)
  const r = await fetchStatus(url);
  const isHtml =
    typeof r.status === "number" && r.status < 400 && r.res &&
    (r.res.headers.get("content-type") || "").includes("text/html");
  if (!isHtml) { try { await r.res?.body?.cancel(); } catch { /* no body */ } return; }
  const html = await r.res.text();
  deepCount++;
  pages[r.finalUrl] = analyzePage(r.finalUrl, html);
}, CONCURRENCY);

// ---- site-level probes (always against the origin root, all scopes) ----
async function probe(path) {
  const r = await fetchStatus(new URL(path, origin.href).href);
  try { await r.res?.body?.cancel(); } catch { /* no body */ }
  return { status: r.status, redirects: r.redirectChain?.length ?? 0, finalUrl: r.finalUrl ?? null };
}

/** Sitemap reader — handles <sitemapindex> by fetching sub-sitemaps (capped). */
async function readSitemap(url, depth = 0) {
  let res;
  try {
    res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
  } catch (e) {
    const code = e?.cause?.code ?? e?.code ?? "";
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError" || /timeout|etimedout/i.test(code);
    return { status: timedOut ? "TIMEOUT" : "FETCH_ERROR", detail: timedOut ? "TIMEOUT" : String(e), index: false, subSitemaps: [], urls: [] };
  }
  if (!res.ok) return { status: res.status, index: false, subSitemaps: [], urls: [] };
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (/<sitemapindex[\s>]/i.test(xml)) {
    let urls = [];
    const subSitemaps = locs;
    if (depth === 0) {
      for (const sub of subSitemaps.slice(0, 5)) {
        const child = await readSitemap(sub, 1);
        urls = urls.concat(child.urls);
        if (urls.length >= 2000) { urls = urls.slice(0, 2000); break; }
      }
    }
    return {
      status: 200,
      index: true,
      subSitemaps,
      urls,
      sampledNote: subSitemaps.length > 5 ? `index has ${subSitemaps.length} sub-sitemaps; first 5 fetched` : null,
    };
  }
  return { status: 200, index: false, subSitemaps: [], urls: locs };
}

let robotsBody = null;
let robotsStatus = "FETCH_ERROR";
try {
  const r = await fetch(new URL("/robots.txt", origin.href), { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
  robotsStatus = r.status;
  if (r.ok) robotsBody = (await r.text()).slice(0, 2000);
} catch { /* stays FETCH_ERROR */ }

const llms = await probe("/llms.txt");
const notFoundProbe = await probe("/this-page-should-not-exist-9x7");
const httpProbe = origin.protocol === "https:" ? await probe(origin.href.replace("https://", "http://")) : null;

// Host consistency: probe the sibling host (www <-> apex).
const altHost = origin.hostname.toLowerCase() === apexHost ? `www.${apexHost}` : apexHost;
const altRes = await fetchStatus(`${origin.protocol}//${altHost}/`);
try { await altRes.res?.body?.cancel(); } catch { /* no body */ }
const altHostProbe = {
  host: altHost,
  status: altRes.status,
  resolvesTo: altRes.finalUrl ?? null,
  redirects: altRes.redirectChain?.length ?? 0,
};

// Trailing-slash consistency: toggle the slash on one deep-analyzed path.
let trailingSlashProbe = null;
const samplePath = Object.keys(pages).map((u) => new URL(u).pathname).find((p) => p !== "/" && p.length > 1);
if (samplePath) {
  const toggled = samplePath.endsWith("/") ? samplePath.slice(0, -1) : samplePath + "/";
  const r = await fetchStatus(new URL(toggled, origin.href).href);
  try { await r.res?.body?.cancel(); } catch { /* no body */ }
  trailingSlashProbe = {
    originalPath: samplePath,
    toggledPath: toggled,
    status: r.status,
    redirects: r.redirectChain?.length ?? 0,
    note:
      r.status === 200 && !(r.redirectChain?.length)
        ? "both slash variants return 200 — duplicate-content signal; check canonicals"
        : "consistent if redirecting to one canonical form",
  };
}

// ---- path clusters (the template map): first path segment; sub-cluster if dominant ----
function buildPathClusters(urls) {
  const bySeg = {};
  for (const u of urls) {
    let clean; try { clean = (new URL(u).pathname.replace(/\/+$/, "")) || "/"; } catch { continue; }
    const segs = clean.split("/").filter(Boolean);
    const key = segs.length === 0 ? "(root)" : `/${segs[0]}/`;
    (bySeg[key] ||= []).push(clean);
  }
  const total = urls.length || 1;
  const out = {};
  for (const [key, paths] of Object.entries(bySeg)) {
    // A dominant cluster (e.g. everything under /blog/) is worth splitting ONLY if the
    // second segment reveals real sub-structure (/blog/news/, /blog/guides/). When the
    // second segment is a unique item slug (/blog/post-N), sub-clustering just yields one
    // cluster per page — useless — so only keep the split if it actually consolidates.
    if (key !== "(root)" && paths.length > total * 0.6) {
      const bySub = {};
      for (const p of paths) {
        const segs = p.split("/").filter(Boolean);
        const subKey = segs.length >= 2 ? `/${segs[0]}/${segs[1]}/` : key;
        (bySub[subKey] ||= []).push(p);
      }
      const consolidates = Object.keys(bySub).length <= paths.length * 0.5;
      if (consolidates) {
        for (const [sk, sp] of Object.entries(bySub)) out[sk] = { count: sp.length, examples: sp.slice(0, 2) };
        continue;
      }
    }
    out[key] = { count: paths.length, examples: paths.slice(0, 2) };
  }
  return out;
}
const pathClusters = buildPathClusters([...seen]);

// ---- derived findings: orphans (in sitemap, unlinked) and pages missing from sitemap ----
// Only meaningful in FULL scope: with partial crawls (section/pages) "unlinked" just
// means "not linked from the few pages we happened to fetch" — misleading evidence.
// null = not computed (vs. [] = computed, none found).
const norm = (u) => { try { const x = new URL(u); return x.origin.toLowerCase() + ((x.pathname.replace(/\/+$/, "")) || "/") + x.search; } catch { return u; } };
const linkedNorm = new Set([...linkedTargets].map(norm));
const sitemapNorm = new Set(sitemapSeeds.map(norm));
const fullScopeDerived = scopeMode === "full" && sitemapSeeded;
const orphanCandidates = fullScopeDerived ? sitemapSeeds.filter((u) => !linkedNorm.has(norm(u))).slice(0, 25) : (scopeMode === "full" ? [] : null);
const notInSitemap = fullScopeDerived ? [...htmlPages].filter((u) => !sitemapNorm.has(norm(u))).slice(0, 25) : (scopeMode === "full" ? [] : null);

// ---- coverage ----
const sameSiteChecked = Object.keys(linkStatus).filter((u) => { try { return sameSite(new URL(u).hostname); } catch { return false; } }).length;
const coverage = {
  urlsKnown: new Set([...seen, ...outOfScopeSameSite]).size,
  fromSitemap: sitemapSeeds.length,
  sitemapSeeded,
  urlsStatusChecked: sameSiteChecked,
  statusCheckCapHit,
  pagesDeepAnalyzed: Object.keys(pages).length,
};

const entries = Object.entries(linkStatus);
const siteLevelProbes = {
  sitemap: {
    status: sm.status,
    isIndex: sm.index,
    subSitemapCount: sm.subSitemaps?.length ?? 0,
    urlCount: sm.urls.length,
    sampledNote: sm.sampledNote ?? null,
    stagingUrlsInSitemap: sm.urls
      .filter((u) => { try { return STAGING_HOST_RX.test(new URL(u).hostname); } catch { return false; } })
      .slice(0, 10),
  },
  robots: { status: robotsStatus, body: robotsBody },
  llmsTxt: llms,
  notFoundProbe: { ...notFoundProbe, soft404: notFoundProbe.status === 200 },
  httpToHttps: httpProbe,
  altHostProbe,
  trailingSlashProbe,
};

const report = {
  requestedUrl: startUrl,
  origin: origin.href,
  originReanchored: startUrl.replace(/\/$/, "") !== origin.href.replace(/\/$/, ""),
  scope: {
    mode: scopeMode,
    sectionPrefix: normSectionPrefix ? normSectionPrefix.replace(/\/?$/, "/") : null,
    requestedPages: scopeMode === "pages" ? requestedPages : null,
    skippedOffSiteUrls,
  },
  coverage,
  pathClusters,
  pagesWithForms: [...pagesWithForms].sort().slice(0, 50),
  orphanCandidates,
  notInSitemap,
  brokenLinks: entries.filter(([, v]) => typeof v.status === "number" && v.status >= 400 && ![403, 429, 503].includes(v.status)),
  possiblyBotBlocked: entries
    .filter(([, v]) => [403, 429, 503].includes(v.status))
    .map(([u, v]) => ({ url: u, status: v.status, note: "likely bot protection / rate limiting — verify in a browser, do not report as broken" })),
  fetchErrors: entries
    .filter(([, v]) => typeof v.status !== "number")
    .map(([u, v]) => ({ url: u, error: v.status, detail: v.error ?? null })),
  redirectChains: entries.filter(([, v]) => (v.redirectChain?.length ?? 0) >= 2),
  // Site-level probes always run, but for scoped reviews they're clearly OUTSIDE the
  // requested scope — nested so the agent never silently folds them into a scoped verdict.
  ...(scopeMode === "full"
    ? siteLevelProbes
    : { siteLevelProbes: { outsideRequestedScope: true, ...siteLevelProbes } }),
  pages,
};

writeFileSync("crawl-report.json", JSON.stringify(report, null, 2));

const clusterCount = Object.keys(pathClusters).length;
const scopeLabel = scopeMode === "full" ? "full site" : scopeMode === "section" ? `section ${report.scope.sectionPrefix}` : `${deepList.length} requested page(s)`;
console.log(
  `Origin: ${origin.href}${report.originReanchored ? " (re-anchored)" : ""}. Scope: ${scopeLabel}. ` +
  `Known ${coverage.urlsKnown} same-site URLs (${sitemapSeeded ? `sitemap ${coverage.fromSitemap}` : "link-discovery only"}), status-checked ${coverage.urlsStatusChecked}${statusCheckCapHit ? " (cap 1500 hit)" : ""}. ` +
  `Deep-analyzed ${coverage.pagesDeepAnalyzed} across ${clusterCount} path clusters. ` +
  `Broken: ${report.brokenLinks.length}. Fetch errors: ${report.fetchErrors.length}. Redirect chains: ${report.redirectChains.length}. ` +
  `Soft 404: ${siteLevelProbes.notFoundProbe.soft404}. Sitemap: ${sm.status}. Pages with forms: ${pagesWithForms.size}.` +
  (scopeMode === "full" ? ` Orphans: ${orphanCandidates.length}. Not-in-sitemap: ${notInSitemap.length}.` : " (orphan/not-in-sitemap analysis: full scope only)")
);
console.log(
  "Full evidence in crawl-report.json. Coverage model: EVERY in-scope URL status-checked; the rich layer is a template sample from `pathClusters` — build the deep-review sample from it and state coverage explicitly." +
  (scopeMode !== "full" ? " Scoped run: site-level findings are under `siteLevelProbes` (outsideRequestedScope) — surface any blockers there to the owner, but they don't flip the scoped verdict." : "")
);
