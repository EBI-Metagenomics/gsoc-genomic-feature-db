# Local package integration

The production UI is available for review as the private local package
`genomic-feature-db-component`. It is not an npm release and has no configured
registry. Build and install it only through the tarball workflow documented in
[`ui-component/README.md`](../ui-component/README.md).

The supported version 0.1 boundary is intentionally narrow: one composed
`GenomicFeatureBrowser`, the `GenomicDataset`, `GenomicFeature`, and props types,
and the `styles.css` subpath. JBrowse remains built in. There is no public
search-only component, host-owned JBrowse adapter, view-state prop, worker API,
or search hook.

`npm run test:package` builds and inspects the package, installs its tarball into
`examples/package-consumer`, confirms one React installation, performs a clean
consumer production build, and runs the critical journey against both the Vite
development server and the built preview. That journey observes the packaged
worker and WASM responses, search, pagination, the public selection callback,
JBrowse navigation, one-based-to-zero-based highlight conversion, and highlight
replacement.

Package publication is blocked pending mentor decisions on the official name
and scope, registry, release owner, licence, first EBI consumer and its React /
bundler versions, Visual Framework independence, and supported browsers and
deployment environments. The local package remains `private: true` until those
decisions are recorded.
