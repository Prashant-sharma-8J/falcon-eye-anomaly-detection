import argparse
import datetime
import random
from app.db.connection import get_connection
from app.db.repository import refresh_user_features_cache

TRANSACTION_TYPES = ["debit", "credit", "transfer"]
CHANNELS = ["pos", "online", "atm"]

def random_date() -> datetime.datetime:
    # Use standard 60-day historical window
    start = datetime.datetime.now() - datetime.timedelta(days=60)
    end = datetime.datetime.now()
    return start + (end - start) * random.random()

def insert_transaction(cursor, user_id: int, amount: float, txn_type: str, channel: str, created_at: datetime.datetime) -> int:
    cursor.execute(
        """
        INSERT INTO transactions (user_id, amount, txn_type, channel, created_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (user_id, amount, txn_type, channel, created_at),
    )
    return cursor.lastrowid

def insert_anomaly(cursor, txn_id: int, user_id: int, amount: float, error_score: float, is_anomaly: bool, created_at: datetime.datetime) -> None:
    cursor.execute(
        """
        INSERT INTO anomalies (txn_id, user_id, amount, error_score, is_anomaly, details, flagged_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (txn_id, user_id, amount, error_score, is_anomaly, '{"decision": "flagged"}', created_at),
    )

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic FalconEye transactions with customer segmentation and anomalies")
    parser.add_argument("--rows", type=int, default=8000)
    parser.add_argument("--users", type=int, default=500)
    args = parser.parse_args()

    print(f"Generating {args.rows} transactions across {args.users} customers...")
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Define high-volume / high-value upper middle class users (15% of customer base)
        num_vip = int(args.users * 0.15)
        vip_users = set(random.sample(range(1, args.users + 1), num_vip))
        
        # Batch insert data
        for i in range(args.rows):
            # Select user
            if random.random() < 0.4:
                # 40% probability of selecting an upper middle class user (dense activity)
                user_id = random.choice(list(vip_users)) if vip_users else random.randint(1, args.users)
            else:
                user_id = random.randint(1, args.users)
                
            created_at = random_date()
            txn_type = random.choice(TRANSACTION_TYPES)
            channel = random.choice(CHANNELS)
            
            # Determine transaction characteristics
            is_vip = user_id in vip_users
            is_anomaly = random.random() < 0.02  # 2% global anomaly rate
            
            if is_anomaly:
                # Anomaly is significantly higher than user's normal baseline
                if is_vip:
                    amount = round(random.uniform(75000, 150000), 2)  # Extreme amount for VIP
                else:
                    amount = round(random.uniform(15000, 45000), 2)   # Extreme amount for regular user
            else:
                # Normal baseline transactions
                if is_vip:
                    amount = round(random.uniform(800, 18000), 2)     # Upper middle class spendings
                else:
                    amount = round(random.uniform(10, 2500), 2)       # Regular spending
            
            txn_id = insert_transaction(cursor, user_id, amount, txn_type, channel, created_at)
            
            if is_anomaly:
                # Record the anomaly inside the anomalies database table directly
                error_score = round(random.uniform(3.5, 9.8), 4)
                insert_anomaly(cursor, txn_id, user_id, amount, error_score, True, created_at)
                
        print("Refreshing transaction aggregation feature cache...")
        refresh_user_features_cache(conn)
        conn.commit()
        print(f"Successfully generated database seed: {args.rows} transactions and associated anomalies.")
    except Exception as e:
        conn.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()

