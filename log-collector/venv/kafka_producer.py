from kafka import KafkaProducer
import json

producer = None

def get_producer():
    global producer
    if producer is None:
        try:
            producer = KafkaProducer(
                bootstrap_servers="localhost:9092",
                value_serializer=lambda v: json.dumps(v).encode("utf-8")
            )
        except Exception as e:
            print("Kafka not available:", e)
            return None
    return producer

def send_log(log):
    p = get_producer()
    if p:
        p.send("logs_topic", log)