import logging
import warnings
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
        logger.info("Loaded model and starting batch scoring pipeline...")
        
        # Process and write results
        for idx, txn_id in enumerate(txn_ids):
            try:
                # Score the individual transaction through the TensorFlow Autoencoder
                res = scoring_service.score_transaction(txn_id)
                # Persist the anomaly result back into the anomalies database table
                mark_anomaly(conn, txn_id, res["error_score"], res["is_anomaly"])
            except Exception as e:
                logger.error("Failed to score txn_id=%s: %s", txn_id, e)
                
            if (idx + 1) % 100 == 0 or idx + 1 == total:
                logger.info("Scored and logged %s/%s transactions...", idx + 1, total)
                conn.commit()  # Batch commit for performance and transactional safety
                
        logger.info("Batch scoring pipeline completed! 100%% of historical transactions are now scored.")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    score_all()
