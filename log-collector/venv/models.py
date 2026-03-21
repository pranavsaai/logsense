from pydantic import BaseModel
from datetime import datetime

class Log(BaseModel):
    service_name: str
    log_level: str
    message: str
    endpoint: str
    latency_ms: int
    timestamp: datetime