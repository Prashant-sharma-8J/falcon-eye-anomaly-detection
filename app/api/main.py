import os
import json
import random
import warnings
# Suppress pandas SQL Connection UserWarnings to keep the FastAPI server logs clean
warnings.filterwarnings("ignore", category=UserWarning)

from functools import lru_cache
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.db.connection import get_connection
from app.db.repository import (
    create_transaction,
    get_latest_anomaly,
    mark_anomaly,
    get_recent_transactions,
    get_recent_anomalies,
    get_dashboard_stats
)
from app.services.scoring import ScoringService
import threading
from app.workers.anomaly_worker import main_loop


app = FastAPI(title="FalconEye Anomaly Detection API", version="1.0.0")


@app.on_event("startup")
def start_background_worker():
    # Spawns the worker polling loop in a background daemon thread
    # This consolidates the API and Worker inside a single process for free-tier hosting (e.g. Render)
    print("FalconEye launching background anomaly scoring worker thread...")
    worker_thread = threading.Thread(target=main_loop, daemon=True)
    worker_thread.start()


class TransactionCreate(BaseModel):
    user_id: int = Field(..., gt=0)
    amount: float = Field(..., gt=0)
    txn_type: str
    channel: str


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def login_endpoint(payload: LoginRequest):
    if payload.username == "admin" and payload.password == "adminfed5269":
        return {
            "status": "success",
            "role": "admin",
            "name": "System Administrator",
            "email": "admin@falconeye.com",
            "avatar": "AD",
            "token": "admin-session-secure-token-8743"
        }
    elif payload.username == "visitor" and payload.password == "visitor123":
        return {
            "status": "success",
            "role": "visitor",
            "name": "Guest Watcher",
            "email": "visitor@securebank.com",
            "avatar": "GW",
            "token": "visitor-session-secure-token-2490"
        }
    else:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password. Please try again."
        )


@lru_cache(maxsize=1)
def get_scoring_service() -> ScoringService:
    return ScoringService()


# ==========================================================================
# HIGH-FIDELITY BACKEND SANDBOX DATA STATE (MySQL Offline Fallbacks)
# ==========================================================================
MOCK_TRANSACTIONS = []
MOCK_ANOMALIES = []

def seed_mock_data():
    global MOCK_TRANSACTIONS, MOCK_ANOMALIES
    now = datetime.now()
    types = ["debit", "credit", "transfer"]
    channels = ["online", "mobile", "atm", "pos"]
    
    for i in range(35, 0, -1):
        time = now - timedelta(minutes=i * 12)
        amount = round(random.uniform(10.0, 3800.0), 2)
        user_id = random.choice([1, 2, 5, 8, 12, 18, 25, 45, 50])
        mean = 0.05 + (user_id % 7) * 0.04
        std = 0.01 + (user_id % 5) * 0.01
        threshold = mean + 3.0 * std
        is_anomaly = i % 10 == 0
        score = random.uniform(1.4, 4.2) if is_anomaly else random.uniform(0.015, 0.42)
        score = round(score, 4)
        
        MOCK_TRANSACTIONS.append({
            "txn_id": 84200 + i,
            "user_id": user_id,
            "amount": amount,
            "txn_type": random.choice(types),
            "channel": random.choice(channels),
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "error_score": score,
            "is_anomaly": 1 if score > threshold else 0
        })

    MOCK_ANOMALIES = [
        {
            "id": idx + 1,
            "txn_id": t["txn_id"],
            "user_id": t["user_id"],
            "amount": t["amount"],
            "error_score": t["error_score"],
            "is_anomaly": True,
            "flagged_at": t["created_at"]
        } for idx, t in enumerate(MOCK_TRANSACTIONS) if t["is_anomaly"] == 1
    ]
    MOCK_ANOMALIES.reverse()

seed_mock_data()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transactions", status_code=201)
def create_transaction_endpoint(payload: TransactionCreate):
    try:
        conn = get_connection()
        try:
            # Check if user exists in the database transactions or cache
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT EXISTS(SELECT 1 FROM transactions WHERE user_id = %s LIMIT 1)", (payload.user_id,))
                exists = cursor.fetchone()[0]
                if not exists:
                    cursor.execute("SELECT EXISTS(SELECT 1 FROM user_features_cache WHERE user_id = %s LIMIT 1)", (payload.user_id,))
                    exists = cursor.fetchone()[0]
            finally:
                cursor.close()
                
            if not exists:
                raise HTTPException(
                    status_code=400, 
                    detail=f"User ID {payload.user_id} does not exist in the database. Please select an existing user account."
                )
                
            txn_id = create_transaction(conn, payload.user_id, payload.amount, payload.txn_type, payload.channel)
        finally:
            conn.close()
        return {"txn_id": txn_id, "status": "queued"}
    except HTTPException:
        raise
    except Exception:
        # Fallback to simulated in-memory store
        mock_user_ids = {t["user_id"] for t in MOCK_TRANSACTIONS}
        if payload.user_id not in mock_user_ids:
            raise HTTPException(
                status_code=400,
                detail=f"User ID {payload.user_id} does not exist in the sandbox database. Please choose a user ID from 1 to 50."
            )
            
        txn_id = 84200 + len(MOCK_TRANSACTIONS) + 1
        new_txn = {
            "txn_id": txn_id,
            "user_id": payload.user_id,
            "amount": payload.amount,
            "txn_type": payload.txn_type,
            "channel": payload.channel,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error_score": 0.0,
            "is_anomaly": 0
        }
        MOCK_TRANSACTIONS.insert(0, new_txn)
        return {"txn_id": txn_id, "status": "queued_sandbox", "simulated": True}


@app.post("/transactions/{txn_id}/score")
def score_transaction_endpoint(txn_id: int):
    try:
        result = get_scoring_service().score_transaction(txn_id)
        conn = get_connection()
        try:
            mark_anomaly(conn, txn_id, result["error_score"], result["is_anomaly"])
        finally:
            conn.close()
        return result
    except Exception:
        # Fallback to simulated score calculation using the local autoencoder models if possible
        # Find the transaction in MOCK_TRANSACTIONS
        txn = next((t for t in MOCK_TRANSACTIONS if t["txn_id"] == txn_id), None)
        if not txn:
            # Generate a mock one if requested directly
            txn = {
                "txn_id": txn_id,
                "user_id": 1,
                "amount": 250.0,
                "txn_type": "debit",
                "channel": "online",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "error_score": 0.0,
                "is_anomaly": 0
            }
            MOCK_TRANSACTIONS.insert(0, txn)
        
        user_id = txn["user_id"]
        amount = txn["amount"]
        mean = 0.05 + (user_id % 7) * 0.04
        std = 0.01 + (user_id % 5) * 0.01
        threshold = mean + 3.0 * std
        
        anomaly_weight = (amount / 2000.0) if amount > 2500 else 0.1
        score = mean + (random.random() * std * 2) + (anomaly_weight - 0.1)
        final_score = max(0.015, round(score, 4))
        is_anomaly = final_score > threshold

        txn["error_score"] = final_score
        txn["is_anomaly"] = 1 if is_anomaly else 0
        
        if is_anomaly:
            MOCK_ANOMALIES.insert(0, {
                "id": len(MOCK_ANOMALIES) + 1,
                "txn_id": txn_id,
                "user_id": user_id,
                "amount": amount,
                "error_score": final_score,
                "is_anomaly": True,
                "flagged_at": txn["created_at"]
            })
            
        return {
            "txn_id": txn_id,
            "user_id": user_id,
            "amount": amount,
            "txn_type": txn.get("txn_type", "debit"),
            "channel": txn.get("channel", "online"),
            "error_score": final_score,
            "threshold": round(threshold, 4),
            "threshold_source": "user" if user_id <= 30 else "global",
            "is_anomaly": is_anomaly,
            "simulated": True
        }


@app.get("/transactions/{txn_id}/risk")
def get_transaction_risk(txn_id: int):
    try:
        return get_scoring_service().score_transaction(txn_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/anomalies/{txn_id}")
def get_anomaly(txn_id: int):
    conn = get_connection()
    try:
        anomaly = get_latest_anomaly(conn, txn_id)
    finally:
        conn.close()

    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    return jsonable_encoder(anomaly)


@app.get("/api/stats")
def api_get_stats():
    try:
        conn = get_connection()
        try:
            stats = get_dashboard_stats(conn)
        finally:
            conn.close()
        return stats
    except Exception as exc:
        # Fallback to dynamic, calculated simulated stats from MOCK_TRANSACTIONS
        total_txns = len(MOCK_TRANSACTIONS)
        total_anomalies = sum(1 for t in MOCK_TRANSACTIONS if t["is_anomaly"] == 1)
        anomaly_rate = round((total_anomalies / total_txns * 100), 2) if total_txns > 0 else 0.0
        total_volume = sum(t["amount"] for t in MOCK_TRANSACTIONS)
        
        return {
            "total_txns": total_txns,
            "total_anomalies": total_anomalies,
            "anomaly_rate": anomaly_rate,
            "total_volume": round(total_volume, 2),
            "simulated": True
        }


@app.get("/api/transactions")
def api_list_transactions(limit: int = 50):
    try:
        conn = get_connection()
        try:
            txns = get_recent_transactions(conn, limit)
        finally:
            conn.close()
        return jsonable_encoder(txns)
    except Exception as exc:
        return jsonable_encoder(MOCK_TRANSACTIONS[:limit])


@app.get("/api/anomalies")
def api_list_anomalies(limit: int = 50):
    try:
        conn = get_connection()
        try:
            anomalies = get_recent_anomalies(conn, limit)
        finally:
            conn.close()
        return jsonable_encoder(anomalies)
    except Exception as exc:
        return jsonable_encoder(MOCK_ANOMALIES[:limit])


@app.get("/api/thresholds")
def api_get_thresholds():
    try:
        path = settings.threshold_path
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"threshold": 1.1294, "global_threshold": 1.1294, "user_thresholds": {}}
    except Exception as exc:
        return {"threshold": 1.1294, "global_threshold": 1.1294, "user_thresholds": {}, "error": str(exc)}


# Mount static pages
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/")
def serve_index():
    index_path = os.path.join("app", "static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "FalconEye Anomaly Detector API. Static frontend is not yet created inside app/static."}

