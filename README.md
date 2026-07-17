# Skills for Marketing-Site Engineers

Agents can now build a marketing site in one prompt. They still have no idea what a **launch-ready** marketing site looks like.

I've reviewed 100+ site launches at a web agency — Webflow builds, custom Astro/Next.js builds, and the migrations in between. These skills are that review process, encoded: the checks, the failure patterns, and the launch bar, so your agent reviews like a senior developer instead of a linter.

All of these skills are a side-effect of doing the work. AI doesn't replace that experience — it distributes it.

## Install

Cross-agent (Claude Code, Codex, Cursor, and others via [skills.sh](https://skills.sh)):

```
npx skills@latest add krishneshkp/skills --skill review-site
```

(Or `npx skills@latest add krishneshkp/skills` to browse everything in this repo.)

Claude Code native:

```
/plugin marketplace add krishneshkp/skills
/plugin install review-site@krishnesh-skills
```

Manual: copy `skills/review-site/` into your agent's skills directory (e.g. `~/.claude/skills/` or project-level `.claude/skills/`).

## Skills

| Skill | What it does |
|---|---|
| **[review-site](skills/review-site/SKILL.md)** | Full technical QA of a marketing site against an agency launch bar. Auto-detects the platform (Webflow, Astro, Next.js) and review mode (pre-launch vs production), runs deterministic checks via bundled scripts, applies judgment standards, and returns a findings table with an explicit **Launch: Blocked / Approved** verdict. |

## Why this exists

Two failure modes dominate real launches:

1. **Webflow sites** fail on what the platform did that you forgot to catch — staging domains left indexable, default og:images shipped, reference collections leaking into the sitemap, form notifications going nowhere.
2. **Custom-stack sites** (Astro, Next.js) fail on what nobody built because Webflow used to do it silently — no sitemap, no redirects file, no 404 route, no font pipeline.

`review-site` reviews both sides, because the interesting work right now is happening in the migration between them.

## Scope

The review matches what you ask for. Under the hood the crawler runs one of three scopes:

```
# full site (default): sitemap-seeded, crawls and status-checks everything
node skills/review-site/scripts/crawl.js https://acme.com

# a section: only pages under the prefix
node skills/review-site/scripts/crawl.js https://acme.com --section /blog/

# exactly these pages, nothing else
node skills/review-site/scripts/crawl.js --pages https://acme.com/pricing https://acme.com/features
```

Coverage is honest by design: **every** in-scope URL is status- and meta-checked (cheap, exhaustive), while the expensive browser + judgment layer is sampled one representative per template — and every report states exactly what was checked in full vs. sampled. Flags for any scope: `--concurrency 5` (polite parallelism), `--max-pages 30` (deep-analysis cap; never caps status-checking).

## Roadmap

- [ ] **Analytics & consent verification** — does tracking actually *fire*? page_views on SPA navigation, events reaching the dataLayer, consent tools genuinely blocking pre-consent
- [ ] **Localization review** — non-localized URLs, hreflang, untranslated strings, locale switcher integrity
- [ ] **Migration parity mode** — old site vs new site: redirect coverage, meta/schema parity, content diff
- [ ] Platform modules for other builders — community contributions welcome

## Notes

- Scripts need Node 18+ (`crawl.js`/`detect.js` are zero-dependency). First run for the browser scripts: `cd skills/review-site/scripts && npm install && npx playwright install chromium`. `perf.js` runs Lighthouse — Node 20+ recommended; on older Node it automatically falls back to Lighthouse 10.
- Validate the plugin packaging with `claude plugin validate .` before publishing changes.
- Standards are opinionated on purpose. PRs that add checks should come with the war story that earned them.

## License

MIT
