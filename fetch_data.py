import requests
import pandas as pd
import numpy as np

LAT = 14.52311
LON = 121.05557

url = "https://archive-api.open-meteo.com/v1/archive"
params = {
    "latitude": LAT,
    "longitude": LON,
    "start_date": "2020-01-01",
    "end_date": "2024-12-31",
    "hourly": "rain,precipitation",
    "timezone": "Asia/Manila"
}

response = requests.get(url, params=params)
data = response.json()

df = pd.DataFrame({
    "timestamp": data["hourly"]["time"],
    "precipitation": data["hourly"]["rain"]
})

df["timestamp"] = pd.to_datetime(df["timestamp"])
df["precipitation"] = df["precipitation"].fillna(0)

df["rise_rate"] = df["precipitation"].diff().fillna(0).clip(lower=0)

df["water_level"] = df["precipitation"].rolling(window=6).sum().fillna(0)

def classify(wl, precip, rate):
    if wl > 20 or rate > 5 or precip > 30:
        return 'critical'
    elif wl > 10 or rate > 2 or precip > 15:
        return 'warning'
    else:
        return 'normal'

df["status"] = df.apply(lambda row: classify(
    row["water_level"], row["precipitation"], row["rise_rate"]), axis=1)

df = df[["water_level", "precipitation", "rise_rate", "status"]]
df.to_csv("bahgo_training_data.csv", index=False)

print(f"Done! {len(df)} rows saved.")
print(df["status"].value_counts())