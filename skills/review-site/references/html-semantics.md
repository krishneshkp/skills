# HTML Semantics & Content Sanity

Markup quality and the embarrassment-prevention layer.

## Checks — semantics

- **[HIGH]** `<main>`, `<nav>`, `<footer>` elements present. [S]
- **[LOW]** Nav and footer links grouped in `<ul>`/`<li>`. [S]
- **[HIGH]** JS selects elements via **data attributes**, not class names — class renames silently break class-coupled scripts. Flag `querySelector('.some-class')` / jQuery class selectors in custom code. [J]
- **[LOW]** Every element has a meaningful class — no default platform names (`div block 487`) visible in the published HTML. Detectable from published class strings. [S]

## Checks — content sanity

- **[CRITICAL] (production)** No lorem ipsum or placeholder text ("Your Title Here", "Add content") on any published page. [S] — crawl.js also flags unresolved `{{…}}` template bindings in visible markup (`placeholderPatterns` — e.g. a CMS field that never bound), stray text nodes in `<head>` (`strayHeadText` — browsers hoist them into the body), and doubled-quote paste artifacts like `src=""https://…""` (`malformedAttrQuotes`). Year tokens (`{{Year}}`) are deliberately excluded — that's the dynamic-copyright-year technique, handled as a suggestion in the check below, never here.
- **[HIGH]** No empty CMS-bound elements rendering blank sections (unset optional fields leaving hollow layouts). [J] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** No hidden leftover content in the published HTML: style-guide blocks, placeholder sections, or unused variants wrapped in `.hide` / `display:none`. Visually invisible, but still rendered, so crawlers and scrapers parse it, it adds page weight, and it can break structure (a hidden rich-text block adding a second `h1`). Fix: remove it from the published page, not just hide it. Functional hidden UI (modals, mobile menus, dropdowns, skip links) is fine and never flagged. [J]
- **[LOW]** Copyright year is correct (not stale). A dynamically generated year — CMS, or a `{{Year}}` token swapped client-side (`dynamicYearPlaceholder`) — keeps the footer from going stale, but a correct hardcoded year is perfectly fine; only *suggest* going dynamic, never require it. Some clients prefer plain static text. If a `{{Year}}` token renders literally (JS hasn't run / a non-JS crawler), note it as a minor polish item, not a defect. [S] <!-- TODO(krishnesh): verify against a real launch -->
