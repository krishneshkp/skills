# Structured Data & AEO (Answer Engine Optimization)

Search engines and LLMs both read this layer. Marketing sites increasingly get discovered through answer engines — this file is what makes the site legible to them.

## Checks

- **[HIGH]** Schema.org JSON-LD parses as valid JSON and validates structurally; no duplicate blocks of the same `@type` on one page (a classic copy-paste artifact). [S] (`jsonld.duplicateTypes`)
- **[HIGH]** Right schema type for the page type: Organization on the homepage, Article/BlogPosting on posts, FAQPage where an FAQ exists, BreadcrumbList on deep pages. Wrong-type schema is worse than none. [J] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** Schema coverage: key templates carry schema, not just the homepage. [J] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** llms.txt present at the root and reflects the real site structure — a house standard worth flagging, but with no confirmed search/LLM consumer yet it is not launch material. [S]
- **[HIGH]** Core content renders without JavaScript — fetch raw HTML and confirm headings/copy are present. Critical for custom stacks; crawlers and LLM agents often don't execute JS. [S+J] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** Content structure is crawler-legible: one topic per page, headings that describe content, no text baked into images for key claims. [J] <!-- TODO(krishnesh): verify against a real launch -->

## Notes for the reviewer

- No schema at all on a simple brochure site is Low, not High — proportionality matters. Invalid or wrong-type schema is always at least High.
