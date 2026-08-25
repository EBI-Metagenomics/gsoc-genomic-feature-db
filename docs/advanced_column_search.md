# FTS5 Configuration History

## Current configuration

The published database uses a contentless FTS5 table with:

```sql
content='',
detail=none,
columnsize=0,
tokenize='unicode61 tokenchars ''_.'''
```

The current product provides a single all-field search box. It turns safe user
input into prefix terms and searches identifiers, names, biotypes, descriptions,
and annotations together. It does not expose a field selector, phrase search,
proximity search, or raw FTS5 syntax.

`detail=none` stores only the matching rowid. `columnsize=0` omits per-column
document-length metadata. Both are compatible with the current rowid-ordered,
cursor-paginated query and minimise the static database bytes fetched through
HTTP Range requests.

## Retired column-scoped configuration

Earlier builds used `detail=column, columnsize=1`. That configuration could
support internal expressions such as `name : ("BRCA1"*)`, because FTS5 retained
the column containing each match. It was retained temporarily while field-scoped
search was evaluated.

The production UI never exposed that capability. The benchmark comparison found
that `detail=none, columnsize=0` was the better match for the current product:
it produced the smallest database and lower search transfer while retaining
similar visible-search latency. See
[`benchmark/final-report-all-three-setups.md`](../benchmark/final-report-all-three-setups.md).

## Consequences for future work

Column-targeted MATCH expressions are not supported by a `detail=none` database.
If user research establishes a need for field-specific search, the project must
first define the UI and query contract, rebuild the database with an appropriate
FTS detail setting, and compare the resulting database size and browser transfer
cost. This is a deliberate product decision, not a runtime toggle.

`annotations` and `functional_summary` remain complementary regardless of the
detail setting: `annotations` is search-only text in FTS5, while
`functional_summary` is compact grouped metadata stored in `feature_meta` for
UI badges and popovers.
