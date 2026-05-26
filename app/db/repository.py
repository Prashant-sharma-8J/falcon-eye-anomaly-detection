from typing import Optional

import pandas as pd


def get_training_data(conn) -> pd.DataFrame:
    query = """
      SELECT t.txn_id, t.user_id, t.amount, t.txn_type, t.channel,
             COALESCE(u.avg_amount_30d, 0) AS avg_amount_30d,
             COALESCE(u.txn_count_30d, 0) AS txn_count_30d,
             t.created_at
      FROM transactions t
      LEFT JOIN user_features_cache u ON t.user_id = u.user_id
      WHERE t.created_at <= NOW() - INTERVAL 1 DAY
      ORDER BY t.created_at ASC
    """
    return pd.read_sql(query, conn)


def get_transaction_with_features(conn, txn_id: int) -> pd.DataFrame:
    query = """
      SELECT t.txn_id, t.user_id, t.amount, t.txn_type, t.channel,
             COALESCE(u.avg_amount_30d, 0) AS avg_amount_30d,
             COALESCE(u.txn_count_30d, 0) AS txn_count_30d,
             t.created_at
      FROM transactions t
      LEFT JOIN user_features_cache u ON t.user_id = u.user_id
      WHERE t.txn_id = %s
    """
    return pd.read_sql(query, conn, params=(txn_id,))


def create_transaction(conn, user_id: int, amount: float, txn_type: str, channel: str) -> int:
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO transactions (user_id, amount, txn_type, channel, created_at)
            VALUES (%s, %s, %s, %s, NOW())
            """,
            (user_id, amount, txn_type, channel),
        )
        txn_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO pending_jobs (txn_id, status, attempts, created_at) VALUES (%s, 'pending', 0, NOW())",
            (txn_id,),
        )
        refresh_user_features_cache(conn, user_id)
        conn.commit()
        return txn_id
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()


def fetch_pending_job(conn) -> Optional[dict]:
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT job_id, txn_id
            FROM pending_jobs
            WHERE status = 'pending'
            ORDER BY created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """
        )
        row = cursor.fetchone()
        if not row:
            conn.rollback()
            return None

        cursor.execute(
            """
            UPDATE pending_jobs
            SET status = 'processing', attempts = attempts + 1
            WHERE job_id = %s
            """,
            (row["job_id"],),
        )
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()


def update_job_status(conn, job_id: int, status: str, last_error: str | None = None) -> None:
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE pending_jobs SET status = %s, last_error = %s WHERE job_id = %s",
            (status, last_error, job_id),
        )
        conn.commit()
    finally:
        cursor.close()


def mark_anomaly(conn, txn_id: int, error_score: float, is_anomaly: bool) -> None:
    cursor = conn.cursor()
    try:
        cursor.callproc("mark_anomaly", (txn_id, float(error_score), int(is_anomaly)))
        conn.commit()
    finally:
        cursor.close()


def get_latest_anomaly(conn, txn_id: int) -> Optional[dict]:
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM anomalies WHERE txn_id = %s ORDER BY flagged_at DESC LIMIT 1",
            (txn_id,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()


def refresh_user_features_cache(conn, user_id: int | None = None) -> None:
    cursor = conn.cursor()
    try:
        if user_id is None:
            cursor.execute(
                """
                INSERT INTO user_features_cache (user_id, avg_amount_30d, txn_count_30d)
                SELECT user_id, AVG(amount), COUNT(*)
                FROM transactions
                WHERE created_at >= NOW() - INTERVAL 30 DAY
                GROUP BY user_id
                ON DUPLICATE KEY UPDATE
                  avg_amount_30d = VALUES(avg_amount_30d),
                  txn_count_30d = VALUES(txn_count_30d)
                """
            )
        else:
            cursor.execute(
                """
                INSERT INTO user_features_cache (user_id, avg_amount_30d, txn_count_30d)
                SELECT user_id, AVG(amount), COUNT(*)
                FROM transactions
                WHERE user_id = %s
                  AND created_at >= NOW() - INTERVAL 30 DAY
                GROUP BY user_id
                ON DUPLICATE KEY UPDATE
                  avg_amount_30d = VALUES(avg_amount_30d),
                  txn_count_30d = VALUES(txn_count_30d)
                """,
                (user_id,),
            )
    finally:
        cursor.close()


def get_recent_transactions(conn, limit: int = 50) -> list[dict]:
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT t.txn_id, t.user_id, t.amount, t.txn_type, t.channel, t.created_at,
                   a.error_score, COALESCE(a.is_anomaly, 0) AS is_anomaly
            FROM transactions t
            LEFT JOIN anomalies a ON t.txn_id = a.txn_id
            ORDER BY t.created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        return cursor.fetchall()
    finally:
        cursor.close()


def get_recent_anomalies(conn, limit: int = 50) -> list[dict]:
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, txn_id, user_id, amount, error_score, is_anomaly, details, flagged_at
            FROM anomalies
            ORDER BY flagged_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        return cursor.fetchall()
    finally:
        cursor.close()


def get_dashboard_stats(conn) -> dict:
    cursor = conn.cursor(dictionary=True)
    try:
        # Total transaction count
        cursor.execute("SELECT COUNT(*) AS total_txns FROM transactions")
        total_txns = cursor.fetchone()["total_txns"] or 0

        # Total anomalies count
        cursor.execute("SELECT COUNT(*) AS total_anomalies FROM anomalies")
        total_anomalies = cursor.fetchone()["total_anomalies"] or 0

        # Anomaly rate
        anomaly_rate = (total_anomalies / total_txns * 100) if total_txns > 0 else 0.0

        # Total amount in last 30 days
        cursor.execute("SELECT SUM(amount) AS total_volume FROM transactions WHERE created_at >= NOW() - INTERVAL 30 DAY")
        total_volume = cursor.fetchone()["total_volume"] or 0.0

        return {
            "total_txns": total_txns,
            "total_anomalies": total_anomalies,
            "anomaly_rate": round(anomaly_rate, 2),
            "total_volume": float(total_volume),
        }
    finally:
        cursor.close()

