import random
import datetime
import os
import mysql.connector
from dotenv import load_dotenv

# Load env variables
load_dotenv()

conn = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME")
)

cur = conn.cursor()

transaction_types = ["debit", "credit", "transfer"]
channels = ["pos", "online", "atm"]

def random_date():
    start = datetime.datetime.now() - datetime.timedelta(days=60)
    end = datetime.datetime.now()
    return start + (end - start) * random.random()

def insert_random_transaction():
    user_id = random.randint(1, 50)
    amount = round(random.uniform(50, 20000), 2)
    txn_type = random.choice(transaction_types)
    channel = random.choice(channels)
    created_at = random_date()

    cur.execute("""
        INSERT INTO transactions (user_id, amount, txn_type, channel, created_at)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, amount, txn_type, channel, created_at))

for _ in range(1000):  
    insert_random_transaction()

conn.commit()
print("Inserted 1000 synthetic transactions")
conn.close()