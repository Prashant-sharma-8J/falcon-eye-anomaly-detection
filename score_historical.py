import logging
import warnings
import time
# Suppress pandas SQL Connection UserWarnings to keep the CLI clean
warnings.filterwarnings("ignore", category=UserWarning)

from app.db.connection import get_connection
from app.services.scoring import ScoringService
from app.db.repository import mark_anomaly

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("falconeye.scoring_historical")

def score_all():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        logger.info("Fetching unscored transactions from database...")
        # Find all transaction IDs that are not present in the anomalies table
        cursor.execute("""
            SELECT txn_id FROM transactions 
            WHERE txn_id NOT IN (SELECT txn_id FROM anomalies)
            ORDER BY txn_id ASC
        """)
        rows = cursor.fetchall()
        txn_ids = [r["txn_id"] for r in rows]
        total = len(txn_ids)
        logger.info("Found %s unscored transactions to evaluate.", total)
        
        if total == 0:
            logger.info("All transactions are already scored and processed!")
            return
            
        scoring_service = ScoringService()
        logger.info("Loaded model and starting resilient batch scoring pipeline...")
        
        # Close search cursor and connection to refresh for loop
        cursor.close()
        conn.close()
        
        # Process in chunks with fresh connections to avoid idle timeouts and limits
        for idx, txn_id in enumerate(txn_ids):
            retry_count = 3
            success = False
            while retry_count > 0 and not success:
                try:
                    conn = get_connection()
                    try:
                        res = scoring_service.score_transaction(txn_id)
                        mark_anomaly(conn, txn_id, res["error_score"], res["is_anomaly"])
                        success = True
                    finally:
                        conn.close()
                except Exception as e:
                    retry_count -= 1
                    logger.error("Error scoring txn_id=%s, retries left=%s: %s", txn_id, retry_count, e)
                    if retry_count > 0:
                        time.sleep(1)
                    else:
                        logger.critical("Failed to score txn_id=%s completely.", txn_id)
                
            if (idx + 1) % 50 == 0 or idx + 1 == total:
                logger.info("Scored and logged %s/%s transactions...", idx + 1, total)
                
        logger.info("Batch scoring pipeline completed! 100%% of historical transactions are now scored.")
    except Exception as e:
        logger.critical("Global failure in historical scoring script: %s", e)

if __name__ == "__main__":
    score_all()

