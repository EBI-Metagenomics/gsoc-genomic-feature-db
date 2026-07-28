import logging
import os


def get_db_size_mb(db_path: str) -> float:
    if os.path.exists(db_path):
        return os.path.getsize(db_path) / (1024 * 1024)
    return 0.0


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.hasHandlers():
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        formatter = logging.Formatter("[%(name)s] %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger
