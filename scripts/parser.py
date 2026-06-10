import gzip
from urllib.parse import unquote
from config import (
    LOW_VALUE_TYPES,
    FUNCTIONAL_TAGS,
    DESCRIPTION_KEYS,
    NAME_KEYS,
    ID_KEYS,
    BIOTYPE_KEYS,
)
from models import GenomicFeature


class GFFParser:
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
                joined = cls.compact_join(filtered)
                if joined:
                    parts.append(f"{tag}: {joined}")

        return " | ".join(parts) if parts else None

    @classmethod
    def build_functional_summary(
        cls,
        attrs: dict[str, list[str]],
        max_chars: int = 300,
    ) -> str | None:
        # Build a compact display string for feature_meta.functional_summary.
        # Takes at most 3 values per tag to keep it short for UI display.
        parts = []
        for tag in FUNCTIONAL_TAGS:
            values = attrs.get(tag)
            if not values:
                continue
            joined = cls.compact_join(values, max_items=3, max_chars=80)
            if joined:
                parts.append(f"{tag}: {joined}")

        result = " | ".join(parts) if parts else None
        if result and len(result) > max_chars:
            result = result[:max_chars].rstrip() + "..."
        return result

    @classmethod
    def parse_line(cls, line: str, generated_id: int) -> GenomicFeature | None:
        if not line or line[0] == "#" or line.isspace():
            return None

        line = line.rstrip("\r\n")
        cols = line.split("\t")

        if len(cols) < 9:
            return None

        try:
            start = int(cols[3])
            end = int(cols[4])
        except ValueError:
            return None

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
            return None

        if not has_real_annotation and not has_identity:
            return None

        return GenomicFeature(
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
        )
