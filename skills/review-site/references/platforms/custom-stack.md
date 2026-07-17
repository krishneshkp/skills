# Platform Module: Custom Stacks (Astro, Next.js)

Loaded when Astro (`<meta name="generator" content="Astro">`) or Next.js (`__NEXT_DATA__`, `/_next/`) is detected. Apply ON TOP of the core review.

Custom-stack failure mode: **what nobody built because Webflow used to do it silently.** One-shot migrations look perfect and quietly lose the infrastructure the platform provided for free. This module is the checklist of everything that must now exist on purpose.

## Checks

- **[HIGH]** Sitemap actually generated — an integration exists (e.g. `@astrojs/sitemap`, `next-sitemap`) and the output is live and valid. "We migrated" does not mean "we have a sitemap". [S]
- **[CRITICAL] (migration)** Redirects file exists (`vercel.json` / `netlify.toml` / middleware / platform config) AND covers the old site's URL map. Sample old URLs. [S+J]
- **[HIGH]** Custom 404 route built and returning a real 404 status — frameworks don't guarantee a designed one. [S]
- **[HIGH]** Font pipeline done by hand: self-hosted WOFF2, preloads, font-display — nothing does this for you anymore. [S]
- **[HIGH]** Image pipeline configured: framework image components/integrations in use, formats and responsive sizes generated — not raw `<img>` tags pointing at originals. [S+J]
- **[HIGH]** OG/social images are **absolute URLs** — the classic relative-path bug that breaks every share card after migration. [S]
- **[HIGH]** Draft/preview routes guarded — draft content and preview endpoints not publicly reachable or indexable. [J]
- **[CRITICAL]** No server-side env vars leaked into the client bundle — scan page source and JS chunks for secret-shaped values. [S+J]

## Notes for the reviewer

- On migrations, run the indexability file with extra suspicion: canonicals, hreflang remnants, and hardcoded old-domain links survive migrations constantly.
- Roadmap (not yet in scope): verifying analytics fires on client-side route changes / view transitions.
