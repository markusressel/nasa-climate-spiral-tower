import os

BUILD_DIR = "build"
OUT_DIR = "out"

DEFAULT_URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
CACHE_FILE = os.path.join(BUILD_DIR, "GLB.Ts+dSST.csv")
JSON_FILE = os.path.join(OUT_DIR, "climate_data.json")
JS_FILE = os.path.join(OUT_DIR, "climate_data.js")
SCAD_FILE = os.path.join(OUT_DIR, "climate_spiral_tower.scad")

DEFAULT_BASELINE_RADIUS = 25.0
DEFAULT_SCALE_FACTOR = 10.0
DEFAULT_THICKNESS = 2.0
DEFAULT_HUB_DIAMETER = 18.0
