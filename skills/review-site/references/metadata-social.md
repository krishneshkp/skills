# Metadata & Social

How the site appears in search results, link previews, and browser chrome. Broken social cards are a classic silent launch bug.

## Checks

- **[HIGH]** Meta title present on every page (**[CRITICAL]** if missing on homepage/key landing pages). [S]
- **[LOW]** Meta title length ~50–60 chars; flag truncation risk, don't police to the character. [S]
- **[HIGH]** Meta description present on key pages. [S]
- **[LOW]** Meta description length ~140–160 chars. [S]
- **[HIGH]** Open Graph image present on key pages. [S]
- **[HIGH]** OG image is an **absolute URL** and ~1200×630 (min 600×315). [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** `og:title` and `og:description` present. [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** `twitter:card` present (`summary_large_image` for marketing pages). [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** Favicon is branded — not the platform default. [S+J]
- **[HIGH]** Webclip (apple-touch-icon) is branded. [S+J]
- **[HIGH]** `<html lang="…">` attribute set and correct. [S]

## Notes for the reviewer

- Verify OG rendering by fetching the raw HTML (social scrapers don't run JS) — an OG tag injected client-side is a finding on custom stacks.
