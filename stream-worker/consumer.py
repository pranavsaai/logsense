from kafka import KafkaConsumer
import json
import psycopg2
from anomaly_detector import detect_anomaly
from collections import defaultdict
import os

metrics = defaultdict(lambda: {
    "request_count": 0,
    "error_count": 0,
    "total_latency": 0
})

conn = psycopg2.connect(os.getenv("DATABASE_URL"))

cursor = conn.cursor()

consumer = KafkaConsumer(
    "logs_topic",
    bootstrap_servers="localhost:9092",
    group_id="logsense-group",
    value_deserializer=lambda x: json.loads(x.decode("utf-8"))
)

counter = 0

for message in consumer:
    try:
        log = message.value
        service = log["service_name"]

        print("Saving log:", service)

        cursor.execute("""
            INSERT INTO logs (service_name, log_level, message, endpoint, latency_ms, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            log["service_name"],
            log["log_level"],
            log["message"],
            log["endpoint"],
            log["latency_ms"],
            log["timestamp"]
        ))

        metrics[service]["request_count"] += 1
        metrics[service]["total_latency"] += log["latency_ms"]

        if log["log_level"] == "ERROR":
            metrics[service]["error_count"] += 1

        if metrics[service]["request_count"] % 10 == 0:
            req = metrics[service]["request_count"]
            err = metrics[service]["error_count"]
            total_lat = metrics[service]["total_latency"]

            avg_latency = total_lat / req
            error_rate = err / req

            if error_rate > 0.3:
                cursor.execute("""
                    INSERT INTO alerts (service_name, alert_type, message)
                    VALUES (%s, %s, %s)
                """, (service, "HIGH_ERROR", f"Error rate: {error_rate:.2f}"))

            if avg_latency > 400:
                cursor.execute("""
                    INSERT INTO alerts (service_name, alert_type, message)
                    VALUES (%s, %s, %s)
                """, (service, "HIGH_LATENCY", f"{avg_latency:.2f}ms"))

            result = detect_anomaly(error_rate, avg_latency)
            if result == "ANOMALY DETECTED 🚨":
                cursor.execute("""
                    INSERT INTO alerts (service_name, alert_type, message)
                    VALUES (%s, %s, %s)
                """, (service, "ANOMALY", "ML detected anomaly"))

            cursor.execute("""
                INSERT INTO service_metrics (service_name, request_count, error_count, avg_latency)
                VALUES (%s, %s, %s, %s)
            """, (service, req, err, avg_latency))

            metrics[service] = {
                "request_count": 0,
                "error_count": 0,
                "total_latency": 0
            }

        counter += 1
        if counter % 10 == 0:
            conn.commit()

    except Exception as e:
        print("Error:", e)
        conn.rollback()