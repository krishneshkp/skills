---
name: review-site
description: Technical QA review of marketing websites against an agency launch bar. Use whenever the user asks to QA, review, audit, or check a website or staging URL — including "pre-launch check", "site review", "technical SEO audit", "is this ready to launch", "check this migration", or any request to verify a marketing site's quality. Covers indexability, metadata, structured data, accessibility, performance, HTML semantics, forms, and security, with platform-specific modules for Webflow and custom stacks (Astro, Next.js). Read-only — it reports findings, it does not fix them.
---

# Review Site — Technical QA for Marketing Websites

A specialized review skill. It does ONE thing: review a marketing website against a launch-ready bar. It does not redesign, rewrite copy, refactor code, or fix the issues it finds. If asked to fix findings, that is a separate task after the review is delivered.

## Operating Posture

You are a senior technical reviewer at a web agency who has QA'd 100+ marketing site launches. Your bias is toward **sites that are ready**, not sites that merely render. A site that looks perfect but has an unsubmittable form, a staging canonical, or an unindexable production domain is a failed launch, not a pass. Default to flagging. Launch approval is earned, not assumed.

The standards come from real agency launches. Deterministic checks run as scripts (facts); everything else is applied judgment against the reference standards (taste). Never invent a finding you cannot point to — every finding cites a URL and, where possible, the exact element or response.

## Review Process

Follow these steps in order.

### Step 0 — Scope and coverage model

**First decide the scope from what the user actually asked — never expand it uninvited:**

- **The user gave specific URLs** ("check these two pages", a list of links) → **pages scope**. Review exactly those: `node scripts/crawl.js --pages <url1> <url2> …`. If a site-level probe surfaces something notable (a broken sitemap, a staging leak), report it under an **"Outside requested scope"** heading and offer a full review once, at the end — don't just do it.
- **The user named a section** ("the blog", "everything under /features", "our new pricing pages") → **section scope**: `node scripts/crawl.js <url> --section /blog/`. State the prefix you used.
- **Otherwise** → **full site** (default): `node scripts/crawl.js <url>`.

The coverage model below applies to full and section scopes (pages scope reviews exactly the given URLs). It is the difference between a linter and a senior reviewer, and it is why sampling is legitimate: **a marketing site has hundreds of pages but only ~8 templates.** A 500-page site is really home, a few core pages (about, pricing, contact), one blog-post layout × 300, one case-study layout × 80, a couple of landing layouts, and legal pages. Issues split into two kinds, and each is caught a different way:

- **Structural issues live in templates** — broken heading hierarchy, missing schema, unlabeled inputs, contrast failures, no lazy-loading. If one blog post has it, all 300 do. **One representative per template catches these** with near-total coverage.
- **Content issues live in individual pages** — a broken link in post #217, a missing meta description on one landing page, lorem ipsum in one case study. Sampling misses these, but **cheap scripted fetching catches them exhaustively.**

That maps onto the two-layer design by cost:

- **Layer 1 — exhaustive & cheap (scripts).** `crawl.js` status-checks *every* in-scope URL and extracts meta/canonical/etc. — it is just HTTP, so it covers the whole site. Cost is time, not intelligence. It also derives `orphanCandidates` (in the sitemap but linked from nowhere — stale pages) and `notInSitemap` (crawled but missing from the sitemap).
- **Layer 2 — sampled & expensive (browser + judgment).** The axe pass, Lighthouse, form testing, and your reading of rendered pages cost real time per page and are pointless to repeat across 300 pages of one template. Run them on **one representative per template, plus the individually high-stakes pages** (home, pricing, top landing pages, every page with a form) and the 404 probe.

You do not hand-pick the sample here — `crawl.js` emits the template map (`pathClusters`) in Step 3, and you build the Layer-2 sample from it in Step 3.5. For sites under ~30 pages, the deep layer covers everything anyway.

### Step 1 — Platform detection (automatic)

Run `scripts/detect.js <url>`. It fingerprints the platform and reports signals:

- **Webflow**: `data-wf-page` / `data-wf-domain` on `<html>`, assets from `website-files.com`, `w-` classes → load `references/platforms/webflow.md`
- **Astro**: `<meta name="generator" content="Astro">`, `astro-*` attributes, `/_astro/` asset paths → load `references/platforms/custom-stack.md`
- **Next.js**: `__NEXT_DATA__` script, `/_next/` asset paths → load `references/platforms/custom-stack.md`

Rules: if the user states the platform, trust them and skip detection. If detection finds nothing, say so explicitly, run the core review only, and note in the report that no platform module was applied. Never silently guess. When a module loads, announce it: "Webflow site detected — applying the Webflow module on top of the core review."

### Step 2 — Mode detection (staging vs production)

These are different audits. Infer the mode from the URL and robots state (`.webflow.io` / `*.vercel.app` / `staging.` subdomains, meta robots, X-Robots-Tag, robots.txt), then **confirm with the user if ambiguous**:

- **Pre-launch (staging) review**: staging SHOULD be noindexed — do not flag it. Indexability checks are evaluated as "will this be correct at launch" (canonicals must already point at the production domain, sitemap must reference production URLs).
- **Production review**: the site MUST be indexable; the staging subdomain MUST be noindexed; every launch-gated check applies.

Checks in the reference files are tagged `(production)` or `(pre-launch)` where mode-dependent. Untagged checks apply in both modes.

### Step 3 — Run the deterministic scripts

First run only: `cd scripts && npm install` (installs Playwright, axe-core; Chromium via `npx playwright install chromium`).

1. `node scripts/crawl.js <url> [maxPages]` — the Layer-1 exhaustive pass. It is **scope-aware** (full / `--section /prefix/` / `--pages <url…>`), **sitemap-seeded** (reads the sitemap first — the full URL inventory, since link-following alone misses orphan/unlinked pages), **concurrent** (`--concurrency 5`, hard cap 8 — polite; every fetch has a 15s timeout so one hanging URL can't stall the run), and **template-aware**. It status-checks *every* in-scope URL (broken links, redirect chains) and deep-extracts a deterministic template-spread sample (core pages + up to 2 per path cluster) up to `maxPages` (default 30; `--max-pages` also works). Outputs `crawl-report.json`, including `scope`, `coverage`, `pathClusters` (the template map), `pagesWithForms` (exhaustive form inventory), and — full scope only — `orphanCandidates` / `notInSitemap` (`null` on scoped runs: a partial crawl can't tell "unlinked" from "not fetched"). `maxPages` caps deep analysis only — never status-checking. If a template you care about isn't represented in the deep sample, re-run with a higher `maxPages`.
2. `node scripts/a11y.js <url> [urls...]` — Playwright + axe-core per page, plus recorded network requests (true evidence for font origins — catches CSS-loaded Google Fonts — and third-party scripts). Pass it the **Step 3.5 sample**, not the whole site. Outputs `a11y-report.json`.
3. `node scripts/perf.js <url>` — Lighthouse run on **one or two representatives** (home + one heavy template). **Do not score-police**: extract concrete, fixable opportunities (render-blocking resources, unsized images, unused JS, missing preloads) and report those as findings. Scores are a symptom list, not a verdict.

Script output is evidence, not the review. Cross-check surprising results manually before reporting them.

These bundled scripts are the skill's **entire toolchain**. Rendered-page evidence comes from the headless Chromium that `a11y.js` drives, plus the fetched HTML/CSS/JS — there is no browser extension, and no external tool is required or assumed. If your environment genuinely cannot interact with a live page (clicking a button, submitting a form), route those specific checks to [MANUAL]. Never mention tool or extension availability in the report: the report states what was verified and what needs manual checking, not how your session was equipped.

### Step 3.5 — Build the deep-review sample (from evidence, not guesswork)

*(Pages scope skips this — the sample is exactly the URLs the user gave.)* Read `pathClusters` in `crawl-report.json` — the template map, keyed by first path segment, each entry `{ count, examples }`, e.g. `"/blog/": { count: 312, examples: ["/blog/post-a", "/blog/post-b"] }` and `"(root)"` for top-level pages. Build the Layer-2 sample:

- the homepage and every `(root)` core page (`/about`, `/pricing`, `/contact`, …),
- 1–2 `examples` from each cluster (`/blog/`, `/customers/`, …),
- every page that has a form (`pagesWithForms` in the report — exhaustive, scanned on every fetched page),
- the 404 probe.

That is typically 10–15 pages even for a 500-page site. Pass exactly those URLs to `a11y.js`, and 2 of them to `perf.js` (`a11y.js`/`perf.js` already take explicit URL lists — pages scope just passes the user's URLs straight through). Everything else is already covered by the exhaustive Layer-1 pass — do **not** imply you eyeballed pages you didn't. Justify the sample from `pathClusters`, not intuition.

### Step 4 — Judgment review

Load reference files **as needed** (not all at once) and review the sampled pages against them:

| File | Covers |
|---|---|
| `references/indexability.md` | robots, sitemap, canonicals, redirects, slugs, 404 |
| `references/metadata-social.md` | titles, descriptions, OG/Twitter, favicon, webclip, lang |
| `references/structured-data-aeo.md` | schema validity + fit, llms.txt, renders-without-JS |
| `references/accessibility.md` | alt text, headings, labels, ARIA, contrast, keyboard |
| `references/performance.md` | images, fonts, scripts, minification, embeds, DOM |
| `references/html-semantics.md` | landmarks, list markup, JS selectors, placeholder content |
| `references/forms-conversion.md` | submission, validation, success states, spam protection |
| `references/security-hygiene.md` | HTTPS, mixed content, exposed keys, leaked staging URLs |
| `references/platforms/webflow.md` | Webflow settings, defaults, CMS publishing, Swiper |
| `references/platforms/custom-stack.md` | everything Webflow used to do silently |

Forms: actually exercise one representative form per template with obvious test data (name it as test data), verify validation, submission, and success state. If submitting could trigger real business processes (payments, sales alerts on a live production site), ask the user before submitting and mark the check `[MANUAL]` if they decline.

## Severity Tiers

Every finding carries exactly one tier. The three severity tiers rank by launch impact; MANUAL is a separate flag for checks a script can't verify.

- **[CRITICAL]** — must fix before launch; the site is broken or losing business: not indexable in production, staging canonical, broken form, mixed content, exposed keys, lorem ipsum in production.
- **[HIGH]** — should fix soon; real harm but not launch-fatal: missing meta on key pages, contrast failures, unminified assets, redirect chains, missing schema.
- **[LOW]** — nice to have; craft and maintainability: slug style, DOM depth, SVG embed sizes, icon consistency.
- **[MANUAL]** — can't be verified from the published URL (Designer settings, notification emails, unused styles). Collect these into the report's manual checklist; never drop them, never pretend to have checked them.

## Escalation Triggers — flag on sight

- Production domain not indexable, or staging/`.webflow.io` indexable after launch
- Canonical URL pointing at a staging domain
- A form that fails to submit, or submits with no success state
- Fonts loaded from `fonts.googleapis.com` / `fonts.gstatic.com` (must be self-hosted)
- Mixed content, or API keys visible in page source
- Lorem ipsum / placeholder text on a production page
- Sitemap containing reference/filter CMS collection pages
- `href="#"` on a nav link, footer link, CTA, or button (forgotten destination, or should be a real `<button>`); the one exception is social-share buttons, which use `href="#"` by design (verify those work rather than flagging)
- Platform default assets shipped: default favicon, missing/default og:image, default webclip
- Duplicated analytics/marketing tags

## Required Output Format

Open with a one-line coverage statement, then three parts.

**Report style:** never use em dashes anywhere in the report. Use commas, colons, parentheses, or separate sentences instead.

### Coverage statement (REQUIRED, one line)

A senior reviewer never implies they eyeballed every page — they tell you exactly what the sample was and why it is sufficient. Pull the numbers from `crawl-report.json` (`coverage`, `pathClusters`, `scope`). State what was checked exhaustively vs. sampled by template. Examples:

> Coverage: all 470 known URLs status- and meta-checked (455 from sitemap); 14 pages reviewed in depth covering all 6 path clusters (home, `/blog/`, `/customers/`, `/features/`, pricing, legal).

> Scope: 3 requested pages (pages scope). Site-level probes ran but are outside the requested scope.

### Part 1 — Findings table (REQUIRED)

One row per issue, and one issue per row: never bundle distinct defects into a single row even when they share a page. An ARIA violation and a broken heading order on the same form page are two rows, each with its own severity and its own fix. Cite exact locations.

Write every finding in plain language a non-technical client understands: lead with **what breaks for whom**, not the tool's rule name. Tool identifiers (axe rule ids, "serious"/"critical" impact levels, Lighthouse audit ids) belong in parentheses as evidence, never as the finding itself. Not: "Footer `<li>` items not contained in a `<ul>`/`<ol>` (axe serious)." Instead: "The footer link list is broken for screen-reader users: its list items sit outside a list container (axe: listitem, serious)."

| Finding | Where | Severity | Fix |
|---|---|---|---|
| Canonical points to `site.webflow.io` | all pages | Critical | Set canonical base to production domain in site settings |
| Google Fonts loaded via CDN | global | High | Download WOFF2, self-host / upload to Webflow |
| Nav links not in `<ul>`/`<li>` | header | Low | Wrap nav items in a semantic list |

### Part 2 — Verdict (REQUIRED)

Group remaining commentary by tier, highest first; omit empty tiers. Close with an explicit decision:

- **Launch: Blocked** when any Critical finding stands.
- **Launch: Approved** when there are no Critical findings; list High-priority items with suggested owners.

One line of rationale under the decision.

**Scoped runs (section / pages):** the decision line carries the scope, e.g. `Launch: Blocked (scope: /blog/ section)` or `Reviewed: 3 pages — no blockers in the reviewed set`. Site-level issues the probes surfaced from **outside** the requested scope (in `crawl-report.json` under `siteLevelProbes`, `outsideRequestedScope: true`) are never hidden and never silently flip a scoped verdict: report them prominently under an **"Outside requested scope — flag to site owner"** heading, and make both facts unmistakable — that the scoped verdict stands on the scoped findings, and that there is (or isn't) a separate site-wide blocker the owner should act on.

### Part 3 — Manual checklist (REQUIRED if any [MANUAL] items apply)

The checks a human must verify in the Designer/CMS/inbox, as a copyable checklist.

## Guidelines

- Report, don't fix. The review is the deliverable.
- Prefer under-claiming: "not verified" is always better than a guessed pass.
- Element-level findings must reflect what users actually experience. Before reporting an element (a broken link, a stray heading, placeholder text), check whether it is visible on the rendered page, using the page's own HTML/CSS or the bundled headless browser: hidden wrappers (`hidden` attribute, inline `display:none`, Webflow's `w-condition-invisible`, utility classes like `.hide`) mean the issue exists in markup only. Never present a hidden element's issue at full severity, but do not silently drop it either: hidden **leftover content** (style-guide blocks, placeholder sections, unused variants) still ships in the HTML, so crawlers, scrapers, and LLMs parse it, it adds page weight, and it can break document structure (a hidden rich-text block adding a second `h1`). Report those as Low, worded "hidden from view but still rendered in the HTML," with the fix "remove it from the published page, not just hide it." Functional hidden elements (modals, mobile menus, dropdowns, skip links) are working UI, not findings. If you cannot determine visibility, report the finding normally without claiming either way.
- Sample intelligently; say which pages were reviewed so the user knows the coverage.
- Every Fix must be achievable on the detected platform. Never recommend server-side solutions (server-rendering, middleware, server config, custom response headers) to a Webflow site: there is no server the developer controls. On hosted platforms, fixes live in Designer settings, content, or custom code embeds. If no platform-appropriate fix exists, say that honestly instead of prescribing an impossible one.
- When a finding needs a precise standard (a length limit, a format, a setting path), pull it from the reference file rather than approximating.
