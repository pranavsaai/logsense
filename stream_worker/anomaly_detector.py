from sklearn.ensemble import IsolationForest
import numpy as np

data_points = []
model = IsolationForest(contamination=0.1)

def detect_anomaly(error_rate, avg_latency):
    global data_points

    new_point = [error_rate, avg_latency]
    data_points.append(new_point)

    if len(data_points) < 20:
        return "Not enough data"

    X = np.array(data_points)
    model.fit(X)

    prediction = model.predict([new_point])

    return "ANOMALY DETECTED 🚨" if prediction[0] == -1 else "Normal"