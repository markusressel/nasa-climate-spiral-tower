import csv
import datetime
import json
import os
import sys
import urllib.request

from .constants import CACHE_FILE, DEFAULT_URL, JS_FILE, JSON_FILE
from .io_utils import log

def download_data(url: str = DEFAULT_URL, cache_file: str = CACHE_FILE, force: bool = False) -> str:
    os.makedirs(os.path.dirname(cache_file), exist_ok=True)

    if os.path.exists(cache_file) and not force:
        log(f"Using cached data from '{cache_file}'")
        with open(cache_file, "r", encoding="utf-8") as f:
            return f.read()

    log(f"Downloading latest NASA GISTEMP CSV from {url}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as response:
            csv_text = response.read().decode("utf-8")
        with open(cache_file, "w", encoding="utf-8") as f:
            f.write(csv_text)
        log(f"Successfully downloaded and cached data to '{cache_file}'")
        return csv_text
    except Exception as e:
        log(f"Error downloading data: {e}")
        if os.path.exists(cache_file):
            log("Falling back to cached local file...")
            with open(cache_file, "r", encoding="utf-8") as f:
                return f.read()
        log("No cached data found and download failed. Exiting.")
        sys.exit(1)

def parse_csv_data(csv_text: str) -> list[tuple[int, list[float]]]:
    lines = csv_text.splitlines()
    start_idx = next((i for i, line in enumerate(lines) if line.startswith("Year")), -1)
    if start_idx == -1:
        raise ValueError("Could not find header row starting with 'Year' in CSV")

    data: list[tuple[int, list[float]]] = []
    reader = csv.reader(lines[start_idx:])
    next(reader)

    for row in reader:
        if not row or row[0] == "Year" or not row[0].isdigit():
            continue

        year = int(row[0])
        try:
            anomalies: list[float] = []
            for val in row[1:13]:
                val_str = val.strip()
                if val_str == "***" or not val_str:
                    anomalies = []
                    break
                anomalies.append(float(val_str))
            if anomalies:
                data.append((year, anomalies))
        except ValueError:
            continue

    data.sort(key=lambda x: x[0])
    return data

def export_web_data(data: list[tuple[int, list[float]]], json_file: str = JSON_FILE, js_file: str = JS_FILE) -> None:
    log("Exporting parsed data for Web visualizer...")
    os.makedirs(os.path.dirname(json_file), exist_ok=True)

    years = [year for year, _ in data]
    monthly_dict = {year: anomalies for year, anomalies in data}
    payload = {
        "metadata": {
            "source": "NASA GISS Surface Temperature Analysis (GISTEMP v4)",
            "baseline": "1951-1980 baseline period",
            "last_updated": datetime.datetime.now().isoformat(),
            "start_year": years[0],
            "end_year": years[-1],
        },
        "years": years,
        "monthly_anomalies": monthly_dict,
    }

    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    with open(js_file, "w", encoding="utf-8") as f:
        f.write(f"// Auto-generated climate dataset\nwindow.CLIMATE_DATA = {json.dumps(payload, indent=2)};\n")