# Testing `review-site`

Test the skill in a **fresh Claude Code session** — one with none of your build context — so it behaves exactly like a stranger's install.

## Path A — the real user path (GitHub + skills CLI)

Once the repo is pushed to GitHub (`krishneshkp/skills`):

```bash
mkdir ~/real-user-test && cd ~/real-user-test
npx skills@latest add krishneshkp/skills --skill review-site
```

Pick Claude Code when the CLI asks which agents. Then continue from step 2 below (script dependencies) inside the installed copy, and step 3 (fresh session, plain prompt).

After install, spot-check that `scripts/` came through and `node scripts/crawl.js` resolves from the installed skill folder.

## Path B — local manual install (no GitHub needed)

---

## 1. Install the skill (copy the folder)

Pick one:

**User-level** (available in every project — easiest):

```bash
cp -r /Users/krish/Downloads/review-site-qa-skill/krishnesh-skills/skills/review-site ~/.claude/skills/review-site
```

**Project-level** (only inside one test project):

```bash
mkdir -p ~/skill-test/.claude/skills
cp -r /Users/krish/Downloads/review-site-qa-skill/krishnesh-skills/skills/review-site ~/skill-test/.claude/skills/review-site
```

## 2. Install the script dependencies — ONE TIME

The browser checks (accessibility, performance) need Playwright + Chromium. Run this **inside the copied folder's `scripts/`** (a ~150 MB download):

```bash
cd ~/.claude/skills/review-site/scripts   # or your project-level path
npm install
npx playwright install chromium
```

> Skip this and the crawl still works, but `a11y.js` / `perf.js` will fail.

## 3. Start a fresh session and just ask

```bash
cd ~/skill-test        # any folder; the report files get written here
claude
```

Then talk to it like a normal user — no special command:

```
review https://www.bluerails.com before launch
```

If it doesn't trigger on its own, nudge it: `use the review-site skill on https://…`

## 4. What a good run looks like

The agent should, on its own:

- [ ] Announce **platform + mode** ("Webflow detected… production")
- [ ] Run **detect → crawl → a11y → perf**
- [ ] Open with a **one-line coverage statement**
- [ ] Give a **findings table** with **Critical / High / Low** severities
- [ ] Close with **Launch: Approved** or **Launch: Blocked** + a manual checklist

---

## Scenarios to try

| # | What you say | What it tests |
|---|---|---|
| 1 | `review https://www.bluerails.com before launch` | Full production review (your known baseline) |
| 2 | `is https://<something>.webflow.io ready to launch?` | **Staging / pre-launch mode** — staging noindex should NOT be flagged |
| 3 | `review just the blog on https://www.bluerails.com` | **Section scope** — only `/blog*` reviewed |
| 4 | `check these two pages: https://site.com/pricing and https://site.com/features` | **Pages scope** — exactly those, nothing else |
| 5 | `review <a site you KNOW is clean>` | **False-positive check** — does it stay quiet? |
| 6 | `review <a one-shot Astro/Next migration>` | **Custom-stack module** — sitemap, redirects, 404, fonts |
| 7 | `review <a bilingual site>` | Localization signals (hreflang, `lang`) |

## What to judge (the real test)

Precision, not just "did it run":

- On a site you know cold — does it catch what **you** caught by hand? Miss anything?
- Does it **downgrade false positives** (e.g. a hidden `lorem ipsum` style block) instead of screaming?
- Are the **Critical / High / Low** calls ones you'd defend to a client?

## Cleanup

```bash
rm -rf ~/.claude/skills/review-site
```

---

*Tip: the scripts write `crawl-report.json`, `a11y-report.json`, `perf-report.json` into whatever folder you launched `claude` from. Use a scratch folder so they don't clutter a real project.*
