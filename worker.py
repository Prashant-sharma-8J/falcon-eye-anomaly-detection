import time

import json

import numpy as np

import pandas as pd

import os

import mysql.connector

from tensorflow.keras.models import load_model

from dotenv import load_dotenv

# Load environment variables

load_dotenv()

DB_CONFIG = {

    'host': os.getenv('DB_HOST'),

    'user': os.getenv('DB_USER'),

    'password': os.getenv('DB_PASSWORD'),

    'database': os.getenv('DB_NAME'),

    'autocommit': True

}

# Safety check (recommended)

if not all([DB_CONFIG['host'], DB_CONFIG['user'], DB_CONFIG['password'], DB_CONFIG['database']]):

    raise ValueError("Database environment variables not set properly")

conn = mysql.connector.connect(**DB_CONFIG)

MODEL_PATH = 'models/autoencoder.keras'

SCALER_PATH = 'models/scaler.npy'

THRESH_PATH = 'models/threshold.json'

POLL_INTERVAL = 3

def load_resources():
    model = load_model(MODEL_PATH)
    scaler_meta = np.load(SCALER_PATH, allow_pickle=True).item()
    with open(THRESH_PATH, 'r') as f:
        thr = json.load(f)
    return model, scaler_meta, thr

def fetch_pending_job(conn):
    
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT job_id, txn_id FROM pending_jobs WHERE status='pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED")
        row = cur.fetchone()
        if not row:
            cur.close()
            return None
        
        cur.execute("UPDATE pending_jobs SET status='processing', attempts = attempts + 1 WHERE job_id = %s", (row['job_id'],))
        conn.commit()
        cur.close()
        return row
    except Exception as e:
        conn.rollback()
        cur.close()
        raise

def load_txn_and_features(conn, txn_id, feature_cols):
    
    q = """
    SELECT t.txn_id, t.user_id, t.amount, t.txn_type, t.channel,
            COALESCE(u.avg_amount_30d, 0) AS avg_amount_30d,
            COALESCE(u.txn_count_30d, 0) AS txn_count_30d,
            t.created_at
    FROM transactions t
    LEFT JOIN user_features_cache u ON t.user_id = u.user_id
    WHERE t.txn_id = %s
    """
    df = pd.read_sql(q, conn, params=(txn_id,))
    if df.empty:
        return None, None
    # same featurize as training
    Xnum = pd.DataFrame()
    Xnum['amount'] = df['amount'].astype(float)
    Xnum['avg_amount_30d'] = df['avg_amount_30d'].astype(float)
    Xnum['amount_div_avg'] = Xnum['amount'] / (Xnum['avg_amount_30d'] + 1e-6)
    Xnum['txn_count_30d'] = df['txn_count_30d'].astype(float)
    txntype_dummies = pd.get_dummies(df['txn_type'].fillna('unknown'), prefix='type')
    channel_dummies = pd.get_dummies(df['channel'].fillna('unknown'), prefix='chan')
    X = pd.concat([Xnum, txntype_dummies, channel_dummies], axis=1)

    for c in feature_cols:
        if c not in X.columns:
            X[c] = 0.0
    X = X[feature_cols]
    return df.iloc[0].to_dict(), X

def call_mark_anomaly(conn, txn_id, error_score, is_anom):
    cur = conn.cursor()
    try:
        cur.callproc('mark_anomaly', (txn_id, float(error_score), int(is_anom)))
        conn.commit()
    finally:
        cur.close()

def update_job_status(conn, job_id, status, last_error=None):
    cur = conn.cursor()
    cur.execute("UPDATE pending_jobs SET status=%s, last_error=%s WHERE job_id=%s", (status, last_error, job_id))
    conn.commit()
    cur.close()

def main_loop():
    model, scaler_meta, thr = load_resources()
    mean = scaler_meta['mean']
    scale = scaler_meta['scale']
    feature_cols = scaler_meta['columns']
    threshold = thr['threshold']
    print("Loaded model. Threshold:", threshold, "features:", len(feature_cols))

    conn = mysql.connector.connect(**DB_CONFIG)
    try:
        while True:
            job = fetch_pending_job(conn)
            if not job:
                time.sleep(POLL_INTERVAL)
                continue
            job_id = job['job_id']
            txn_id = job['txn_id']
            try:
                txn, Xdf = load_txn_and_features(conn, txn_id, feature_cols)
                if Xdf is None:
                    update_job_status(conn, job_id, 'error', 'txn-not-found')
                    continue
                Xs = (Xdf.values.astype(float) - mean) / (scale + 1e-12)
                Xs = Xs.reshape(1, -1)
                recon = model.predict(Xs)
                mse = float(np.mean((Xs - recon)**2))

                is_anom = 1 if mse > threshold else 0
                call_mark_anomaly(conn, txn_id, mse, is_anom)
                update_job_status(conn, job_id, 'done', None)
                print(f"Processed txn {txn_id} -> error={mse:.6f} anomaly={is_anom}")
                if not is_anom:
                    print(f"Transaction {txn_id} is safe. No anomaly detected.")
                if is_anom:
                    print(f"ALERT: Transaction {txn_id} flagged as anomaly (user {txn['user_id']}, amount {txn['amount']})")
                    try:
                        cur = conn.cursor(dictionary=True)
                        cur.execute("SELECT * FROM anomalies WHERE txn_id = %s ORDER BY flagged_at DESC LIMIT 1", (txn_id,))
                        anomaly_row = cur.fetchone()
                        cur.close()
                        if anomaly_row:
                            print("=== Anomaly Report ===")
                            print(f"Anomaly ID: {anomaly_row['id']}")
                            print(f"Transaction ID: {anomaly_row['txn_id']}")
                            print(f"User ID: {anomaly_row['user_id']}")
                            print(f"Amount: {anomaly_row['amount']}")
                            print(f"Error Score: {anomaly_row['error_score']}")
                            print(f"Flagged At: {anomaly_row['flagged_at']}")
                            print(f"Details: {anomaly_row['details']}")
                            print("======================")
                    except Exception as e:
                        print("Error fetching anomaly report:", e)

            except Exception as e:
                update_job_status(conn, job_id, 'error', str(e))
                print("Job error:", e)
    finally:
        conn.close()

if __name__ == '__main__':
    main_loop()