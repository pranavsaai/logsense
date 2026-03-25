from fastapi import FastAPI
from log_collector.models import Log
from log_collector.kafka_producer import send_log
import psycopg2
from fastapi.middleware.cors import CORSMiddleware
import anthropic
import json
from pydantic import BaseModel
from typing import List, Optional
from collections import deque
import threading
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

conn = psycopg2.connect(os.getenv("DATABASE_URL"))

cursor = conn.cursor()

live_log_buffer = deque(maxlen=50)
buffer_lock = threading.Lock()

anthropic_client = anthropic.Anthropic()  

class AISummaryRequest(BaseModel):
    metrics: List[dict]
    alerts: List[dict]
    timestamp: Optional[str] = None

@app.post("/logs")
def receive_log(log: Log):
    data = log.dict()
    data["timestamp"] = str(data["timestamp"])

    cursor.execute("""
        INSERT INTO logs (service_name, log_level, message, endpoint, latency_ms, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        data["service_name"],
        data["log_level"],
        data["message"],
        data["endpoint"],
        data["latency_ms"],
        data["timestamp"]
    ))

    conn.commit()

    return {"status": "log received"}

@app.get("/logs/recent")
def get_recent_logs():
    """Returns last 50 logs from the in-memory buffer for live feed."""
    with buffer_lock:
        return list(live_log_buffer)


@app.get("/metrics")
def get_metrics():
    cursor.execute("""
        SELECT 
            service_name,
            COUNT(*) as request_count,
            SUM(CASE WHEN log_level = 'ERROR' THEN 1 ELSE 0 END) as error_count,
            AVG(latency_ms) as avg_latency
        FROM logs
        GROUP BY service_name
        ORDER BY request_count DESC
    """)

    rows = cursor.fetchall()

    return [
        {
            "service": r[0],
            "requests": r[1],
            "errors": r[2],
            "latency": float(r[3])
        }
        for r in rows
    ]

@app.get("/alerts")
def get_alerts():
    try:
        cursor.execute("""
            SELECT service_name, alert_type, message, timestamp
            FROM alerts
            ORDER BY timestamp DESC
            LIMIT 20
        """)
        rows = cursor.fetchall()
        return [
            {
                "service": r[0],
                "type": r[1],
                "message": r[2],
                "time": str(r[3])
            } for r in rows
        ]
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}


@app.post("/ai/summary")
def ai_summary(req: AISummaryRequest):
    """
    Sends current metrics + alerts to Claude and returns a plain-English
    analysis of the system's health, anomalies, and recommended actions.
    """
    metrics_text = json.dumps(req.metrics, indent=2)
    alerts_text  = json.dumps(req.alerts,  indent=2)

    prompt = f"""You are an expert SRE (Site Reliability Engineer) analyzing a distributed microservices system called LogSense.

Here is the current system state at {req.timestamp}:

METRICS (per service: requests, errors, avg latency in ms):
{metrics_text}

ACTIVE ALERTS:
{alerts_text}

Please provide a concise, expert analysis (4-6 sentences max) covering:
1. Overall system health status
2. Which service(s) are most at risk and why
3. The most likely root cause if there are anomalies or high error rates
4. One concrete recommended action the team should take right now

Use plain English. Be direct and specific. No bullet points — write as flowing sentences like a real SRE would speak.
If everything looks healthy, say so confidently and briefly."""

    try:
        message = anthropic_client.messages.create(
            model="claude-opus-4-5",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}]
        )
        summary = message.content[0].text
        return {"summary": summary}
    except Exception as e:
        return {"summary": f"AI analysis unavailable: {str(e)}"}


@app.get("/health-scores")
def health_scores():
    """Computes a 0-100 health score per service based on recent metrics."""
    try:
        cursor.execute("""
            SELECT service_name,
                   SUM(request_count) as total_req,
                   SUM(error_count)   as total_err,
                   AVG(avg_latency)   as mean_lat
            FROM service_metrics
            WHERE timestamp > NOW() - INTERVAL '5 minutes'
            GROUP BY service_name
        """)
        rows = cursor.fetchall()
        results = []
        for r in rows:
            svc, req, err, lat = r[0], r[1] or 0, r[2] or 0, r[3] or 0
            error_rate = err / req if req > 0 else 0
            latency_score = max(0, 100 - (lat / 5))
            error_score   = max(0, 100 - error_rate * 200)
            score = round(latency_score * 0.4 + error_score * 0.6)
            results.append({
                "service": svc,
                "score": score,
                "requests": int(req),
                "errors": int(err),
                "avg_latency": round(float(lat), 2),
                "status": "healthy" if score >= 80 else ("degraded" if score >= 50 else "critical")
            })
        return results
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}


@app.post("/ai/explain-anomaly")
def explain_anomaly(data: dict):
    """
    Given anomaly context (service, error_rate, avg_latency, recent_alerts),
    returns a human-readable explanation of likely cause.
    """
    prompt = f"""You are an expert SRE. An ML anomaly was detected in this microservice:

Service: {data.get('service')}
Error rate: {data.get('error_rate')}
Avg latency: {data.get('avg_latency')}ms
Recent alert types: {data.get('alert_types', [])}

In 2-3 sentences, explain the most likely root cause of this anomaly and suggest one immediate action. Be specific and direct."""

    try:
        message = anthropic_client.messages.create(
            model="claude-opus-4-5",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"explanation": message.content[0].text}
    except Exception as e:
        return {"explanation": f"Explanation unavailable: {str(e)}"}