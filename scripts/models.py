from dataclasses import dataclass


@dataclass(slots=True)
class GenomicFeature:
    feature_id: str
    name: str
    feature_type: str
    seqid: str
    start: int
    end: int
    strand: str
    biotype: str
    description: str
    annotations: str | None = None
    functional_summary: str | None = None

    def to_meta_tuple(self, rowid: int) -> tuple:
        # Tuple for INSERT into feature_meta (with explicit rowid).
        return (
            rowid,
            self.feature_id,
            self.name,
            self.feature_type,
            self.seqid,
            self.start,
            self.end,
            self.strand,
            self.biotype,
            self.description,
            self.functional_summary,
        )

    def to_fts_tuple(self, rowid: int) -> tuple:
        # Tuple for INSERT into search_fts (with explicit rowid).
        return (
            rowid,
            self.feature_id,
            self.name,
            self.biotype,
            self.description,
            self.annotations,
        )
