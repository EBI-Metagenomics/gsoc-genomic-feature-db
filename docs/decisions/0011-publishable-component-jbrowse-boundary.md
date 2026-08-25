# ADR 0011: Publish the composed component with an internal JBrowse boundary

## Status

Accepted for local package implementation. Package publication and final
dependency placement remain pending EBI mentor review.

## Context

The project must become a reusable frontend package for other EBI applications.
Its current production experience combines browser-local SQLite search with an
embedded JBrowse linear genome view. Search-result selection navigates and
highlights the corresponding interval in that view.

The mentors have not yet said whether every future consuming application will
want JBrowse as the primary genome view. Removing it now would discard a working
end-to-end feature, while making JBrowse-specific types part of the public API
would make later separation expensive.

The first package therefore needs a simple production API today and a credible
path to make JBrowse optional later.

## Options considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| Publish only the current composed component with no internal boundary | Smallest immediate refactor | Search and JBrowse remain tightly coupled; later extraction risks a breaking rewrite | Rejected |
| Publish separate core-search and JBrowse packages immediately | Maximum consumer choice and smaller search-only install | Adds package/release/version complexity before a consumer has requested it | Deferred |
| Publish one composed component and keep JBrowse behind a private internal boundary | Preserves current functionality and a small public API while allowing later extraction | JBrowse remains an initial install/runtime cost | Chosen |
| Expose a public renderer or `showJBrowse` option in version 1 | Makes JBrowse optional within one package | Freezes an abstraction before real consumer requirements are known | Rejected for version 1 |

## Decision

The first package will:

1. expose `GenomicFeatureBrowser` as the primary production component;
2. include and render the JBrowse linear view by default;
3. keep search state and search UI independent of JBrowse-specific types;
4. keep JBrowse imports, model state, track configuration, coordinate
   conversion, and highlighting inside a private genome-view implementation;
5. pass only project-domain values across that internal boundary, primarily
   `GenomicDataset`, `GenomicFeature | null`, height, and navigation flank;
6. avoid exporting the private genome-view interface or a search-only component
   in version 1.

A hypothetical future external-JBrowse consumer does not change this version 1
decision. `GenomicFeatureSearch`, external JBrowse view-state integration, and
adapter helpers will be added only after a mentor or concrete EBI consumer
confirms the requirement. The preferred first response is an additive export
from the same package; a package split requires measured size or dependency
evidence.

React and React DOM will be peer dependencies. JBrowse will initially be a
direct runtime dependency unless the first EBI consumer already provides and
standardizes it, in which case its dependency placement will be reconsidered
before publication.

Local artifacts will use the temporary private package name
`genomic-feature-db-component` and will be installed from `npm pack` tarballs.
No registry publication is authorized by this decision.

## Rationale

- The composed search-to-JBrowse journey is already implemented and tested.
- One primary component is easier for EBI consumers to install and configure.
- Domain-only communication prevents JBrowse models from becoming part of the
  stable package contract.
- A private boundary preserves future options without imposing multi-package or
  renderer-injection complexity today.
- Delaying a public optionality API lets the first real consumer requirements
  shape that API.

## Trade-offs

### Accepted

- Consumers receive the JBrowse dependency and its bundle/runtime cost even if
  they primarily want search.
- The initial package cannot offer an officially supported search-only import.
- Internal refactoring is required before the first package release to ensure
  search modules do not depend on JBrowse types.

### Mitigations

- Measure package and browser loading costs during package acceptance and Issue
  13 final benchmarks.
- Keep JBrowse code under a clear internal directory and out of the public
  package entry.
- Preserve a domain-level selected-feature contract.
- Add package-consumer tests so later extraction cannot silently break the
  composed component.

## Consequences

### Positive

- Existing users receive the complete working experience.
- The version 1 public API remains small.
- A later search-only subpath or companion package can reuse the search
  implementation without changing existing composed-component imports.

### Negative

- JBrowse contributes substantially to installation and bundle size.
- Applications already using a different JBrowse version may need dependency
  coordination.
- Supporting non-Vite consumers may require additional worker/WASM and JBrowse
  compatibility work.

## Revisit triggers

Reconsider this decision when any of the following occurs:

- an EBI consumer requests search without an embedded genome view;
- an EBI host already owns a JBrowse instance and needs search selections sent
  to that instance;
- JBrowse materially violates an agreed package-size or initial-load target;
- dependency/version conflicts appear in the first consumer application;
- two or more applications need different genome-view implementations;
- accessibility or deployment requirements prevent embedding the current view.

At that point, consider either:

1. a documented search-only subpath export from the same package; or
2. a core search package plus a JBrowse integration package.

Any change must retain the existing composed `GenomicFeatureBrowser` API for the
remainder of its current major version or provide a documented major-version
migration.
