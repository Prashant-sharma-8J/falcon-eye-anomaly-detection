# FalconEye - Transaction Anomaly Detection Backend

FalconEye is a production-style backend for detecting unusual financial transactions with a TensorFlow autoencoder, MySQL-backed transaction storage, per-user anomaly thresholds, an async-style worker, and a FastAPI API.

## What Makes It an Intresting Project 

- FastAPI backend with health, transaction, scoring, and anomaly endpoints
- MySQL schema with indexed transaction, job, feature-cache, and anomaly tables
- Background worker that processes pending scoring jobs
- Shared feature pipeline used by both training and inference
- Autoencoder model trained on historical behavior
- Per-user thresholding:

```text
threshold = mean + k * standard_deviation
```

If a user does not have enough historical samples, FalconEye falls back to a global threshold computed with the same formula.

## Project Structure

```text
.
├── app/
│   ├── api/              # FastAPI app
│   ├── core/             # settings/config
│   ├── db/               # database connection and repository functions
│   ├── ml/               # feature engineering, model, thresholds
│   ├── services/         # training and scoring services
│   └── workers/          # anomaly worker
├── db/schema.sql         # MySQL schema and mark_anomaly procedure
├── tests/                # unit tests
├── Dockerfile
├── docker-compose.yml
├── FalconEye.py          # training entry point
├── worker.py             # worker entry point
└── generate_data.py      # synthetic data generator
```

## Setup

Create a `.env` file:

```env
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=bank_anom
THRESHOLD_K=3.0
MIN_USER_THRESHOLD_SAMPLES=10
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Initialize MySQL using `db/schema.sql`.

## Running Locally

Generate sample transactions:

```bash
python generate_data.py --rows 1000 --users 50
```

This also refreshes `user_features_cache`, which provides each user's 30-day average amount and transaction count for feature engineering.

Train the model:

```bash
python FalconEye.py
```

Run the API:

```bash
uvicorn app.api.main:app --reload
```

Run the worker:

```bash
python worker.py
```

## Docker

```bash
docker compose up --build
```

The API is available at:

```text
http://localhost:8000
```

## API Examples

Create and queue a transaction:

```bash
curl -X POST http://localhost:8000/transactions \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "amount": 2500, "txn_type": "debit", "channel": "online"}'
```

Score a transaction immediately:

```bash
curl -X POST http://localhost:8000/transactions/1/score
```

Check risk without writing an anomaly row:

```bash
curl http://localhost:8000/transactions/1/risk
```

## Model Metadata

Training writes:

- `models/autoencoder.keras`
- `models/scaler.npy`
- `models/threshold.json`

`threshold.json` contains the global fallback threshold and a `user_thresholds` map. Each user threshold includes the user's reconstruction-error mean, standard deviation, sample count, `k`, and final threshold.

## Tests

```bash
pytest
```
