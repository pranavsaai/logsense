from fastapi import FastAPI
from models import Log
from kafka_producer import send_log

app = FastAPI()

logs = []

@app.post("/logs")
def receive_log(log: Log):
    send_log(log.dict())
    logs.append(log)
    return {"status": "log received"}