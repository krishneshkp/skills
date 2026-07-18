# Accessibility

Target: WCAG 2.1 AA on marketing-critical flows. Run the axe pass first (scripts/a11y.js), then apply the judgment checks — axe finds violations, it doesn't judge quality.

## Checks — automated base

- **[HIGH]** Full axe-core pass per sampled page; report `critical` and `serious` violations individually, summarize `moderate`/`minor`. [S]
- **[HIGH]** Colour contrast WCAG AA (covered by axe; spot-check brand-colored buttons and text-on-image heroes manually). [S+J]

## Checks — structure

- **[HIGH]** H1 present, exactly one per page, logical H1→H2→H3 hierarchy (no skipped levels for styling reasons). [S+J]
- **[HIGH]** Image alt text coverage — all content images; decorative images explicitly `alt=""`. [S]
- **[LOW]** Alt text quality: descriptive, not keyword-stuffed, not "image1.png"; sensible length. [J]
- **[HIGH]** Table header cells (`<th>`) where tables exist. [S]

## Checks — interactive elements

- **[HIGH]** Form inputs have labels, and labels are programmatically associated (for/id or wrapping). [S]
- **[HIGH]** Buttons and links have accessible names — including icon-only buttons and link blocks (aria-label). [S]
- **[MANUAL]** `href="#"` links: static HTML cannot tell you whether JavaScript wires the click. Social-share buttons, CTAs that open a modal/form, language switchers, and dropdowns all commonly use `href="#"` (especially on Webflow). Do **not** report these as dead/broken links from the markup alone — verify in a browser that each interactive `#` link fires, and flag only the ones that genuinely do nothing when clicked. (crawl.js's `hashOnlyLinks` already excludes provably-hidden ones like `w-condition-invisible` and inline `display:none`.)
- **[LOW]** An `<a href="#">` that acts as a button should be a real `<button>` (or carry `role="button"` + keyboard handling) so keyboard and assistive-tech users can operate it. This is a semantics improvement, separate from whether the link functions. [S+J]
- **[HIGH]** External links: `target="_blank"` paired with `rel="noopener"`; opening in new tabs is a deliberate choice, not the default everywhere. [S]
- **[HIGH]** Iframes have `title` attributes. [S]
- **[LOW]** ARIA hygiene: no redundant labels duplicating visible text, roles used correctly, no ARIA where native HTML suffices. [J]
- **[LOW]** Link and button text clarity — "Learn more" ×12 on one page is a finding. [J]

## Checks — keyboard & motion

- **[HIGH]** Focus states visible on all interactive elements; full keyboard navigation works (tab through the nav, open menus, submit a form). [J]
- **[HIGH]** `prefers-reduced-motion` honored — heavy scroll/entrance animations gate or reduce. [J] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** Skip-to-content link present. [S] <!-- TODO(krishnesh): verify against a real launch -->
- **[HIGH]** Landmarks present: `<nav>`, `<main>`, `<footer>` (shared with html-semantics.md). [S]
