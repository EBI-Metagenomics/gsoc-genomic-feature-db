interface RowWithId {
  id: number;
}

/** Bound a page fetched with one lookahead row and derive its stable cursor. */
export function boundSearchPage<T extends RowWithId>(rows: T[], pageSize: number) {
  const features = rows.slice(0, pageSize);
  return {
    features,
    nextCursor: features.length > 0 ? Number(features[features.length - 1].id) : null,
    hasMore: rows.length > pageSize,
  };
}
