import sqlite3
from pathlib import Path
import pytest
import sys

# Add scripts directory to path so tests can import from it
SCRIPT_DIR = Path(__file__).parent.parent / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

from indexer import build_database  # noqa: E402

SAMPLE_GFF = SCRIPT_DIR.parent / "sample_data" / "BU_ATCC8492_annotations.gff"


@pytest.fixture
def db_path(tmp_path):
    out = tmp_path / "test_features.db"
    build_database(str(SAMPLE_GFF), str(out))
    return out


@pytest.fixture
def conn(db_path):
    c = sqlite3.connect(str(db_path))
    yield c
    c.close()


@pytest.fixture
def empty_gff(tmp_path):
    p = tmp_path / "empty.gff3"
    p.write_text("##gff-version 3\n")
    return p


@pytest.fixture
def malformed_gff(tmp_path):
    p = tmp_path / "bad.gff3"
    p.write_text("this is not a valid gff3 file\n\t\t\n")
    return p
