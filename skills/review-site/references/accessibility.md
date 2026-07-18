# Accessibility

Target: WCAG 2.1 AA on marketing-critical flows. Run the axe pass first (scripts/a11y.js), then apply the judgment checks — axe finds violations, it doesn't judge quality.

## Checks — automated base

- **[HIGH]** Full axe-core pass per sampled page; report `critical` and `serious` violations individually, summarize `moderate`/`minor`. [S] Translate every axe violation into plain user impact before it enters the findings table: say what fails for which users (screen readers, keyboard users, low-vision users), keep the axe id + impact in parentheses as evidence, and make the fix platform-appropriate (e.g. an orphaned `<li>` on Webflow: use the native List element or fix the embed markup — Webflow's CMS Collection Lists with `role="list"` divs are already valid and never flagged).
- **[HIGH]** Colour contrast WCAG AA (covered by axe; spot-check brand-colored buttons and text-on-image heroes manually). [S+J]

## Checks — structure

- **[HIGH]** H1 present, exactly one per page, logical H1→H2→H3 hierarchy (no skipped levels for styling reasons). [S+J]
- **[HIGH]** Image alt text coverage — all content images; decorative images explicitly `alt=""`. [S]
- **[LOW]** Alt text quality: descriptive, not keyword-stuffed, not "image1.png"; sensible length. [J]
- **[HIGH]** Table header cells (`<th>`) where tables exist. [S]

## Checks — interactive elements

- **[HIGH]** Form inputs have labels, and labels are programmatically associated (for/id or wrapping). [S]
- **[HIGH]** Buttons and links have accessible names — including icon-only buttons and link blocks (aria-label). [S]
- **[HIGH]** Naked `href="#"` on real links and buttons — nav links, footer links, CTAs, normal buttons — is a finding: either the destination was forgotten/unwired, or the element triggers a JS action and should be a real `<button>` (or `role="button"` + keyboard handling). Flag each, citing where. crawl.js's `hashOnlyLinks` counts them (already excluding provably-hidden anchors like `w-condition-invisible` and inline `display:none`). [S+J]
- **[MANUAL]** The one exception: **social-share buttons**. Webflow's share widget legitimately ships `href="#"` and wires the share action in JavaScript. Do **not** report those as dead links — verify in a browser that sharing actually fires, and flag only if it does nothing. [J]
- **[HIGH]** External links: `target="_blank"` paired with `rel="noopener"`; opening in new tabs is a deliberate choice, not the default everywhere. [S]
- **[HIGH]** Iframes have `title` attributes. [S]
- **[LOW]** ARIA hygiene: no redundant labels duplicating visible text, roles used correctly, no ARIA where native HTML suffices. [J]
- **[LOW]** Link and button text clarity — "Learn more" ×12 on one page is a finding. [J]

## Checks — keyboard & motion

- **[HIGH]** Focus states visible on all interactive elements; full keyboard navigation works (tab through the nav, open menus, submit a form). [J]
- **[HIGH]** `prefers-reduced-motion` honored — heavy scroll/entrance animations gate or reduce. [J] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** Skip-to-content link present. [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** Landmarks present: `<nav>`, `<main>`, `<footer>` (shared with html-semantics.md). [S]
