import requests
import random
import time
from datetime import datetime

URL = "http://127.0.0.1:8000/logs"

services = ["auth-service", "payment-service", "order-service"]
levels = ["INFO", "WARN", "ERROR"]
endpoints = ["/login", "/checkout", "/orders", "/payment"]

while True:

    log = {
        "service_name": random.choice(services),
        "log_level": random.choice(levels),
        "message": "sample log message",
        "endpoint": random.choice(endpoints),
        "latency_ms": random.randint(50, 500),
        "timestamp": datetime.utcnow().isoformat()
    }

    try:
        requests.post(URL, json=log)
        print("Log sent:", log["service_name"])
    except:
        print("Collector not reachable")

    time.sleep(0.5)