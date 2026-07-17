# Security Hygiene

Marketing-site scope: not a pentest — the basics that embarrass agencies and leak data.

## Checks

- **[CRITICAL]** HTTPS enforced; no mixed content (http:// assets on https:// pages). [S]
- **[CRITICAL]** No API keys/secrets visible in page source or custom-code embeds. Scan inline scripts for key-shaped strings (long tokens, `sk_`, `AIza…`, `Bearer …`). Public-by-design keys (e.g. Google Maps browser keys) are fine if domain-restricted — ask if unclear. [S+J] — crawl.js runs a heuristic secret-shaped-string scan over inline scripts (`secretShapedStrings`); treat hits as leads to confirm, not verdicts.
- **[HIGH]** No staging/dev URLs referenced in production source (links, canonicals, hardcoded asset origins, comments). [S]
- **[HIGH]** Third-party scripts pinned to a version — no mutable-branch CDN loads (`cdn.jsdelivr.net/gh/…@main`, `raw.githubusercontent.com`): anyone with push access to that repo controls the site's JS. [S] (`unpinnedGitCdnScripts`)
