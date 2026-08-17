# Browser-local architecture, operational boundaries and future work

This project is intentionally a browser-based genomic discovery tool. It loads a
versioned SQLite database through HTTP Range requests and queries it in a Web
Worker, without sending search terms or genomic annotations to a search service.
The design choices below are deliberate trade-offs, not missing backend work.

## Intentional browser-local design

- Search uses escaped all-term prefix matching and ingestion-order pagination.
  It intentionally does not expose raw FTS, Boolean, phrase, proximity, fuzzy,
  stemming, strict-exact or relevance-ranked syntax. These choices keep browser
  queries predictable, avoid user-facing FTS syntax errors, and bound remote
  SQLite work.
- Indexed attributes have per-tag and length caps. The database is a compact
  discovery index for interactive search, not a lossless duplicate of every GFF
  attribute.
- Database ZIPs are immutable, versioned static assets. Regenerating from the
  source GFF on schema changes is the intended reproducible distribution model,
  rather than an in-place migration service.
- HTTP Range, `HEAD`, content length and CORS support are deployment contracts
  for browser-local SQLite. Static hosts or CDNs must preserve them so the
  browser can fetch only the required database pages.
- JBrowse navigation requires GFF `seqid` values and assembly reference names to
  agree exactly. This preserves an unambiguous, client-side mapping from a
  search result to a genomic location.

## Operational and measurement boundaries

- Chromium and Firefox are supported. WebKit is not a current release gate.
- Chromium heap measurements report JavaScript heap, not total browser RSS; Long
  Tasks report page-main-thread responsiveness, not SQLite worker execution.
- The bundled dataset's redistribution permission still requires explicit
  maintainer confirmation.

## Future work

- Evaluate exact, phrase, fuzzy or ranked search only after a researcher need is
  demonstrated and browser database-size, Range-traffic and latency costs are
  measured.
- Add migration tooling only if retaining old generated databases becomes more
  valuable than deterministic regeneration.
- Expand browser validation to WebKit if it becomes a supported deployment
  target.
- Add cross-platform benchmark evidence and repeat measurements on controlled
  hardware when stable performance budgets become release gates.
- Automate package provenance and registry publishing only after maintainers
  approve a public distribution model.
- Resolve and document the long-term licence/provenance status of bundled data.
