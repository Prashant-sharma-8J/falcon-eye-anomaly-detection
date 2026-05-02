# 🦅 FalconEye – Transaction Anomaly Detection

Autoencoder-based anomaly detection system designed to identify unusual transaction patterns using reconstruction error and user-specific adaptive thresholds.

---

## Overview

FalconEye is a machine learning system that detects anomalies in financial transactions by learning normal behavior and flagging deviations.

Unlike basic approaches, it implements per-user dynamic thresholding, allowing personalized anomaly detection based on individual transaction patterns.

---

## How It Works

1. Train an autoencoder on normal transaction data  
2. Compute reconstruction error for each transaction  
3. Compare error against a threshold  
4. Flag transactions exceeding the threshold as anomalies  

Key idea:  
Each user has a custom threshold defined as:

threshold = mean + k × standard deviation

---

## Tech Stack

- Python  
- TensorFlow / Keras  
- NumPy  
- Pandas  
- MySQL  

---

## Project Structure

falcon-eye-anomaly-detection/ │ ├── FalconEye.py ├── worker.py ├── generate_data.py ├── .gitignore ├── README.md

---

## Setup

### 1. Clone the repository
git clone https://github.com/your-username/falcon-eye-anomaly-detection.git cd falcon-eye-anomaly-detection

---

### 2. Install dependencies
pip install -r requirements.txt

---

### 3. Configure environment variables

Create a .env file in the root directory:

DB_HOST=localhost DB_USER=your_username DB_PASSWORD=your_password DB_NAME=bank_anom

---

## Running the Project

### Generate synthetic data
python generate_data.py

### Train the model
python FalconEye.py

### Run anomaly detection worker
python worker.py

---

## Notes

- This project uses synthetic transaction data for simulation  
- Model files and sensitive credentials are excluded via .gitignore  
- Designed as a modular pipeline for experimentation and extension  

---

## Status

Work in progress
