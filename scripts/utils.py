import hashlib
import logging
import os


def get_db_size_mb(db_path: str) -> float:
    if os.path.exists(db_path):
        return os.path.getsize(db_path) / (1024 * 1024)
    return 0.0


def sha256_file(path: str, chunk_size: int = 1024 * 1024) -> str:
    """Return the lowercase SHA-256 digest of a file without loading it into memory."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.hasHandlers():
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        formatter = logging.Formatter("[%(name)s] %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger
