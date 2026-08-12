import gzip
from urllib.parse import unquote

from config import (
    BIOTYPE_KEYS,
    DESCRIPTION_KEYS,
    FUNCTIONAL_TAGS,
    ID_KEYS,
    LOW_VALUE_TYPES,
    NAME_KEYS,
)
from models import GenomicFeature


class GFFParser:
    MALFORMED_COLUMNS = "malformed_columns"
    MALFORMED_COORDINATES = "malformed_coordinates"
    FILTERED_LOW_VALUE = "filtered_low_value"
    FILTERED_UNIDENTIFIED = "filtered_unidentified"

    @staticmethod
    def open_gff_text(path: str):
        if path.lower().endswith((".gz", ".bgz")):
            return gzip.open(path, "rt", encoding="utf-8", errors="replace")
        return open(path, "r", encoding="utf-8", errors="replace")

    @staticmethod
    def parse_attributes(attr_text: str) -> dict[str, list[str]]:
        attrs: dict[str, list[str]] = {}

        if not attr_text or attr_text == ".":
            return attrs

        for part in attr_text.strip().split(";"):
            part = part.strip()

            if not part:
                continue

            if "=" in part:
                key, value = part.split("=", 1)
                values = [unquote(v.strip()) for v in value.split(",") if v.strip()]

                if values:
                    attrs.setdefault(key.strip().lower(), []).extend(values)

            elif " " in part:
                key, value = part.split(" ", 1)
                value = value.strip().strip('"')

                if key.strip() and value:
                    attrs.setdefault(key.strip().lower(), []).append(unquote(value))

        return attrs

    @staticmethod
    def first_attr(
        attrs: dict[str, list[str]], keys: list[str], default: str = ""
    ) -> str:
        for key in keys:
            values = attrs.get(key)
            if values:
                return values[0]
        return default

    @staticmethod
    def compact_join(
        values: list[str], max_items: int = 6, max_chars: int = 500
    ) -> str:
        text = ", ".join(values[:max_items])
        if len(text) > max_chars:
            return text[:max_chars].rstrip() + "..."
        return text

    @classmethod
    def build_annotations(
        cls,
        attrs: dict[str, list[str]],
        feature_id: str,
        name: str,
        biotype: str,
        description: str,
    ) -> str | None:
        parts = []
        seen = set()
        already_used_values = None

        for tag in FUNCTIONAL_TAGS:
            values = attrs.get(tag)
            if not values:
                continue

            if already_used_values is None:
                already_used_values = {
                    v.lower() for v in (feature_id, name, biotype, description) if v
                }

            filtered = []
            tag_lower = tag.lower()

            for value in values:
                value_key = value.lower()
                dedupe_key = (tag_lower, value_key)

                if value_key in already_used_values or dedupe_key in seen:
                    continue

                seen.add(dedupe_key)
                filtered.append(value)

            if filtered:
                # Keep up to 50 values (2000 chars) per tag so every annotation is
                # searchable in FTS, not just the first handful — scientists may query
                # any accession the source carried.
                joined = cls.compact_join(filtered, max_items=50, max_chars=2000)
                if joined:
                    parts.append(f"{tag}: {joined}")

        return " | ".join(parts) if parts else None

    @classmethod
    def build_functional_summary(
        cls,
        attrs: dict[str, list[str]],
    ) -> str | None:
        # Build a display string for feature_meta.functional_summary.
        # Keeps up to 50 values (2000 chars) per tag so the UI can surface every
        # annotation; the cap only guards against a pathological runaway cell and is
        # generous enough to be effectively "all" for real features. There is no
        # global cap across tags, so every populated tag still contributes a segment.
        parts = []
        for tag in FUNCTIONAL_TAGS:
            values = attrs.get(tag)
            if not values:
                continue
            joined = cls.compact_join(values, max_items=50, max_chars=2000)
            if joined:
                parts.append(f"{tag}: {joined}")

        result = " | ".join(parts) if parts else None
        return result

    @classmethod
    def parse_line_with_reason(
        cls, line: str, generated_id: int
    ) -> tuple[GenomicFeature | None, str | None]:
        """Parse one feature and identify why a non-feature row was skipped."""
        if not line or line[0] == "#" or line.isspace():
            return None, cls.MALFORMED_COLUMNS

        line = line.rstrip("\r\n")
        cols = line.split("\t")

        if len(cols) < 9:
            return None, cls.MALFORMED_COLUMNS

        try:
            start = int(cols[3])
            end = int(cols[4])
        except ValueError:
            return None, cls.MALFORMED_COORDINATES

        seqid = cols[0]
        feature_type = cols[2]
        feature_type_key = feature_type.lower()
        strand = cols[6] if cols[6] != "." and cols[6] != "" else "."
        attrs = cls.parse_attributes(cols[8])

        feature_id = cls.first_attr(attrs, ID_KEYS, default=f"generated_{generated_id}")
        name = cls.first_attr(attrs, NAME_KEYS)
        biotype = cls.first_attr(attrs, BIOTYPE_KEYS)
        description = cls.first_attr(attrs, DESCRIPTION_KEYS)

        if len(description) > 500:
            description = description[:500].rstrip() + "..."

        annotations = cls.build_annotations(
            attrs, feature_id, name, biotype, description
        )
        functional_summary = cls.build_functional_summary(attrs)

        has_real_annotation = bool(description or annotations or biotype)
        has_identity = bool(name or not feature_id.startswith("generated_"))

        if feature_type_key in LOW_VALUE_TYPES and not has_real_annotation:
            return None, cls.FILTERED_LOW_VALUE

        if not has_real_annotation and not has_identity:
            return None, cls.FILTERED_UNIDENTIFIED

        return (
            GenomicFeature(
                feature_id=feature_id,
                name=name,
                feature_type=feature_type,
                seqid=seqid,
                start=start,
                end=end,
                strand=strand,
                biotype=biotype,
                description=description,
                annotations=annotations,
                functional_summary=functional_summary,
            ),
            None,
        )

    @classmethod
    def parse_line(cls, line: str, generated_id: int) -> GenomicFeature | None:
        """Parse one feature, preserving the original feature-or-None API."""
        feature, _reason = cls.parse_line_with_reason(line, generated_id)
        return feature
