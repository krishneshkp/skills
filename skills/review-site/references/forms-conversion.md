# Forms & Conversion Paths

A silently broken lead form is the single most expensive failure a marketing site can ship. Almost no audit tool tests this — we do.

## Protocol

`pagesWithForms` in crawl-report.json is the exhaustive list of pages containing a form — start there; every one belongs in the deep-review sample. Exercise one representative form per template with clearly-labeled test data (e.g. name: "QA Test — please ignore"). On live production sites where a submission triggers real business processes, ask the user before submitting; if declined, mark [MANUAL].

## Checks

- **[CRITICAL]** Every form submits successfully — the request fires and is accepted. [J]
- **[HIGH]** Validation works: required fields enforced, email format checked, error states visible and readable. [J] (**[CRITICAL]** if validation lets an empty form through.)
- **[CRITICAL]** Success state appears after submit — a message or a thank-you redirect. Users must know it worked. [J]
- **[HIGH]** Spam protection present (honeypot, Turnstile/reCAPTCHA, or equivalent). [J] <!-- TODO(krishnesh): verify against a real launch -->
- **[LOW]** Input field naming correct and human-readable — submissions and integrations inherit these names. [S+J]
- **[HIGH]** Privacy/consent link adjacent to the form where required. [J] <!-- TODO(krishnesh): verify against a real launch -->
- **[MANUAL]** Form notification email set to the right inbox and a test submission actually received. Cannot be verified from the URL — always in the manual checklist.
