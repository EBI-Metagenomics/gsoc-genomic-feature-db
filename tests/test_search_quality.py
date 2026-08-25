import json
import sqlite3
from pathlib import Path

from config import SCHEMA_VERSION

ROOT = Path(__file__).parent.parent
CASES_PATH = ROOT / "ui-component" / "src" / "test" / "search-quality-cases.json"


def load_fixture():
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))


def fetch_rowids(connection, expression, limit, after_rowid=None):
    cursor_clause = "AND f.rowid > ?" if after_rowid is not None else ""
    bindings = (
        (expression, after_rowid, limit)
        if after_rowid is not None
        else (expression, limit)
    )
    rows = connection.execute(
        f"""
        SELECT f.rowid
        FROM search_fts AS f
        WHERE search_fts MATCH ?
        {cursor_clause}
        ORDER BY f.rowid
        LIMIT ?
        """,
        bindings,
    ).fetchall()
    return [row[0] for row in rows]


def test_fixed_mgyg_search_quality_matrix():
    fixture = load_fixture()
    database = ROOT / fixture["database"]
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)

    try:
        metadata = connection.execute(
            "SELECT schema_version, generator_version FROM database_metadata"
        ).fetchone()
        assert metadata is not None
        assert metadata[0] == fixture["schema_version"] == SCHEMA_VERSION
        assert metadata[1]

        for case in fixture["cases"]:
            expression = case["match_expression"]
            total = connection.execute(
                "SELECT count(*) FROM search_fts WHERE search_fts MATCH ?",
                (expression,),
            ).fetchone()[0]
            assert total == case["expected_total"], case["id"]

            expected = case["expected_rowids"]
            actual = (
                fetch_rowids(connection, expression, len(expected)) if expected else []
            )
            assert actual == expected, case["id"]
            assert fetch_rowids(connection, expression, len(expected)) == actual, case[
                "id"
            ]

            if case["expected_complete"]:
                assert len(expected) == total, case["id"]
            else:
                page_size = fixture["page_size"]
                first_page = fetch_rowids(connection, expression, page_size)
                second_page = fetch_rowids(
                    connection,
                    expression,
                    page_size,
                    after_rowid=first_page[-1],
                )
                assert first_page + second_page == expected, case["id"]
    finally:
        connection.close()


def test_column_specific_search_is_narrower_than_all_columns():
    fixture = load_fixture()
    cases = {case["id"]: case for case in fixture["cases"]}

    assert cases["all_columns"]["expected_total"] > 0
    assert cases["description_column"]["expected_total"] == 0
