# Indexability & Launch Hygiene

The #1 post-launch killer category. Lead every review with this file.

Verification key: [S] = script-verifiable (crawl.js) · [J] = judgment on rendered pages.

## Checks

- **[CRITICAL] (production)** Production site indexable — no `noindex` meta/X-Robots-Tag, robots.txt does not disallow all. [S]
- **[CRITICAL] (production)** Staging subdomain (`.webflow.io`, `*.vercel.app`, `staging.*`) noindexed after launch. [S]
- **[CRITICAL]** Canonical URLs point to the production domain — never a staging domain. [S]
- **[HIGH]** Canonical URL configured on every page, self-referencing unless intentionally consolidated. [S]
- **[HIGH]** sitemap.xml present, valid XML, references production URLs, returns 200. [S]
- **[HIGH]** Filtering/reference CMS collections excluded from the sitemap (collections that exist only to power filters/references, not real content pages). [J] — the fix lives in the platform module.
- **[HIGH]** robots.txt present, valid, and not blocking CSS/JS assets needed for rendering. [S+J] — crawl.js captures the robots.txt body in its report; read the rules, don't trust the status probe. <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** Redirects: no chains (A→B→C) and no loops. [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** Protocol/host consistency: http→https redirects, one canonical host (www or apex), consistent trailing-slash behavior. [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[CRITICAL] (migration/relaunch)** Old-site URL map covered by 301s — sample known old URLs and confirm they resolve to the right new pages. [S+J] <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** A real 404 page exists AND unknown paths return an actual `404` status — not a soft 200. [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** Clean slug/URL formatting: lowercase, hyphenated, human-readable, no IDs or `-2` suffixes. In pre-launch mode treat as High — slugs are cheap to fix before launch and expensive after. [J]

## Notes for the reviewer

- In pre-launch mode, do not flag staging noindex — evaluate whether indexability will be correct *at launch* instead.
- "Sitemap valid" includes: no staging URLs, no 404ing entries (sample 10), no noindexed pages listed.
