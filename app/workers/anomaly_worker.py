import logging
import time
import warnings
# Suppress pandas SQL Connection UserWarnings to keep the worker logs clean
warnings.filterwarnings("ignore", category=UserWarning)

from app.core.config import settings
from app.db.connection import get_connection
from app.db.repository import fetch_pending_job, get_latest_anomaly, mark_anomaly, update_job_status
from app.services.scoring import ScoringService


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("falconeye.worker")


def wait_for_scoring_service() -> ScoringService:
    while True:
        try:
            return ScoringService()
        except OSError as exc:
            logger.warning("Model artifacts are not ready yet: %s", exc)
            time.sleep(settings.poll_interval_seconds)


def main_loop() -> None:
    scoring_service = wait_for_scoring_service()
    logger.info(
        "Loaded model with %s features and %s per-user thresholds",
        len(scoring_service.feature_cols),
        scoring_service.threshold_meta.get("user_threshold_count", 0),
    )
    logger.info("FalconEye background anomaly scoring worker is fully operational!")
    logger.info("Active and scanning the MySQL 'pending_jobs' queue for new transactions... (Running in silent listening mode)")

    conn = get_connection()
    try:
        while True:
            job = fetch_pending_job(conn)
            if not job:
                time.sleep(settings.poll_interval_seconds)
                continue

            job_id = job["job_id"]
            txn_id = job["txn_id"]
            try:
                result = scoring_service.score_transaction(txn_id)
                mark_anomaly(conn, txn_id, result["error_score"], result["is_anomaly"])
                update_job_status(conn, job_id, "done", None)
                logger.info(
                    "Processed txn_id=%s user_id=%s score=%.6f threshold=%.6f source=%s anomaly=%s",
                    txn_id,
                    result["user_id"],
                    result["error_score"],
                    result["threshold"],
                    result["threshold_source"],
                    result["is_anomaly"],
                )

                if result["is_anomaly"]:
                    logger.warning("Anomaly report: %s", get_latest_anomaly(conn, txn_id))
            except Exception as exc:
                update_job_status(conn, job_id, "error", str(exc))
                logger.exception("Job failed job_id=%s txn_id=%s", job_id, txn_id)
    finally:
        conn.close()
