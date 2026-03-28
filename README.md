# LogSense — Upgrade Guide

## What's New

### 1. AI System Analyst (Claude-powered)
- **Endpoint**: `POST /ai/summary`
- The dashboard sends current metrics + alerts to Claude (claude-opus-4-5)
- Claude returns a plain-English SRE analysis: system health, at-risk services, root cause, recommended action
- Auto-runs on dashboard load; refresh button for manual re-analysis

### 2. AI Anomaly Explanation
- **Endpoint**: `POST /ai/explain-anomaly`
- When an ML anomaly is detected, call this endpoint with service context
- Returns a 2-3 sentence human-readable explanation of likely root cause

### 3. Live Log Feed (`/logs/recent`)
- In-memory deque (last 50 logs) maintained in the FastAPI process
- Dashboard polls every 2s and shows a color-coded scrolling stream
- ERROR = red, WARN = yellow, INFO = blue

### 4. Service Health Scores (`/health-scores`)
- Computes a 0–100 score per service from recent metrics
- Formula: 60% error-rate component + 40% latency component
- Shown as bold numbers with color (green/amber/red) on dashboard

### 5. Grouped Alert Intelligence
- Alerts now grouped by type (HIGH_ERROR / HIGH_LATENCY / ANOMALY)
- Count per group shown; styled per severity

---

## Architecture After Upgrade

```
log-generator → POST /logs → FastAPI → Kafka → stream-worker consumer
                                ↓
                         live_log_buffer (deque, in-memory)
                                ↓
                         GET /logs/recent  ← dashboard polls 2s

dashboard → POST /ai/summary → FastAPI → Claude API → AI analysis
dashboard → GET /metrics      → FastAPI → PostgreSQL
dashboard → GET /alerts       → FastAPI → PostgreSQL
dashboard → GET /health-scores → FastAPI → PostgreSQL
```

---

## What Makes LogSense Different

| Feature | Datadog / Grafana | LogSense |
|---|---|---|
| Live log stream | YES | YES |
| Metrics charts | YES | YES |
| Alerts | YES | YES |
| **AI plain-English analysis** | ❌ (enterprise $$$) | YES |
| **Health score per service** | Partial | YES (custom formula) |
| **ML anomaly + explanation** | ❌ | YES |
| **Alert grouping by pattern** | ❌ | YES |
