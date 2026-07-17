# Performance

Run scripts/perf.js (Lighthouse) as a diagnostic, **not a gate**: don't score-police — extract concrete, fixable opportunities from the results (render-blocking resources, unsized images, unused JS, missing preloads) and report those as findings. Scores are a symptom list, not a verdict.

## Checks — images

- **[HIGH]** Image file sizes reasonable for their rendered dimensions; resized and compressed before upload. [S]
- **[HIGH]** Modern compression format (WebP/AVIF) for photographic images. [S]
- **[HIGH]** CMS-uploaded images compressed too — the most commonly missed set. [S+J]
- **[HIGH]** Width/height (or aspect-ratio) set on images to prevent layout shift. [S]
- **[HIGH]** Above-the-fold hero images: eager load + `fetchpriority="high"`. [S]
- **[HIGH]** Below-the-fold images: lazy load. [S]

## Checks — fonts

- **[HIGH]** No fonts loaded from `fonts.googleapis.com` / `fonts.gstatic.com` — fonts must be self-hosted (WOFF2). Escalation trigger. [S] — markup-level evidence in crawl-report.json (`googleFontsInMarkup`); true network-level evidence (catches CSS `@import`/`@font-face` loads) in a11y-report.json (`googleFontsNetwork`, `fontRequests`).
- **[HIGH]** Hero fonts preloaded (`<link rel="preload" as="font" type="font/woff2" crossorigin>`) — only the fonts visible above the fold. [S]
- **[LOW]** `font-display` strategy set (swap/optional) to avoid invisible-text flashes. [S]
- **[LOW]** Preconnect to the font/CDN origin where fonts load cross-origin. [S]

## Checks — scripts & styles

- **[HIGH]** CSS and JS minified (platform toggle or build step). [S+J] — crawl.js lists per-page script/stylesheet URLs; spot-fetch one asset and inspect it before reporting.
- **[HIGH]** jQuery not loaded twice (platform copy + manual copy). [S]
- **[HIGH]** External `<head>` scripts use `defer` or `async`. [S]
- **[HIGH]** Page-specific JS added only to pages that need it — not dumped in global settings. [J]
- **[HIGH]** Third-party script *weight* reasonable — flag an obviously excessive pile-up of render-blocking third-party scripts, judged as a performance cost. Don't audit which individual tools are "justified". [S+J]
- **[LOW]** Ad scripts usage reviewed. [S]

**Consent managers (CMPs — Cookiebot, OneTrust, Usercentrics, iubenda, CookieYes and similar):** usually a legal requirement, not an optimization target. Never report "consent script dominates load" or similar as a finding by itself — the site cannot remove it, so there is nothing actionable. Flag a CMP only when a concrete fix exists: it loads synchronously in `<head>` while the vendor documents an async snippet, two CMPs run on one page, or the snippet is broken/erroring. Unactionable platform or legal constraints are never findings.

**Analytics — scope note (read before reporting anything about tracking):** Do **not** report analytics as missing, incomplete, or unverified, and do not evaluate whether a site's tracking setup is "justified" or complete — that is the site owner's choice, and verifying analytics actually *fires* is an explicit roadmap item, out of scope here. The **only** analytics findings in scope are serious defects in code that already exists: the same tag included twice (double-counted events — this is the duplicated-tags escalation trigger), or a malformed/throwing snippet that breaks other scripts on the page. Evidence for those: `analyticsSignalsInMarkup` and `duplicateAnalyticsScripts` (crawl), `thirdPartyScriptOrigins` (a11y). Absent or minimal analytics is never a finding.

## Checks — document & embeds

- **[HIGH]** HTML/page weight optimal — flag pages with outsized HTML (long inline SVGs are the usual culprit; scan with an HTML size check). [S]
- **[HIGH]** Large SVG embeds converted to PNG/raster; inline SVG reserved for icons and simple shapes. [S+J]
- **[LOW]** Inline SVG icon sizes sane (no 200KB icons). [S]
- **[LOW]** DOM nesting depth reasonable. [S]
- **[HIGH]** Video embeds lazy-loaded; heavy players behind a facade pattern (thumbnail + click-to-load, e.g. lite-youtube) instead of eager iframes. [S+J] <!-- TODO(krishnesh): facade pattern added — verify it matches how you'd actually fix this -->
