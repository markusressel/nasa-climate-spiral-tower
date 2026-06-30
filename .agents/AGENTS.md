# AGENTS.md

This document is for AI coding agents working in this repository.

## Project Overview

ClimateSpiralTower builds climate-anomaly-driven 3D geometry from NASA GISTEMP data.

- Python CLI (`main.py` -> `climate_spiral.cli:main`) handles data fetch/parse/export.
- Browser app (`web-configurator/`) renders interactive Three.js previews and exports STL/3MF.
- Optional OpenSCAD-based authoritative STL generation is supported and can be cached for web preview parity.

## Key Directories and Files

- `main.py`: thin entrypoint.
- `climate_spiral/`: Python package (data pipeline, params, geometry helpers, OpenSCAD export, authoritative cache).
- `web-configurator/`: frontend (state, geometry, rendering, exports, UI, authoritative mesh loading).
- `out/`: generated artifacts (`climate_data.json`, `climate_data.js`, SCAD, authoritative cache files).
- `build/`: downloaded raw CSV cache.
- `README.md`: user-facing workflows and CLI examples.
- `Dockerfile`: Python 3.13 slim image with OpenSCAD + Liberation fonts.

## Python Architecture (`climate_spiral/`)

- `cli.py`
  - Parses CLI flags.
  - Calls `download_data()` + `parse_csv_data()` + `export_web_data()` + `generate_openscad()`.
  - Optional:
    - `--authoritative-year` -> `export_year_disk_stl(...)`
    - `--authoritative-cache` -> `generate_authoritative_cache(...)`
    - `--serve-web` -> local `http.server`.
- `data_pipeline.py`
  - Downloads NASA CSV (with local cache fallback).
  - Parses rows to `list[(year, [12 anomalies])]`.
  - Exports both JSON and `window.CLIMATE_DATA` JS payload.
- `model_params.py`
  - Canonical parameter dataclass + strict validation.
  - Shared shape contract for authoritative cache compatibility.
- `openscad_authoritative.py`
  - Builds per-year SCAD source (including label text) and invokes OpenSCAD CLI or Docker image.
- `authoritative_cache.py`
  - Hashes canonical params and writes `out/authoritative/manifest.json`.
  - Stores year STLs under `out/authoritative/<hash>/disk_<year>.stl`.
- `geometry.py`, `io_utils.py`
  - Shared spline/keyway math and STL helpers.
- `scad_export.py`
  - Writes a generated SCAD file embedding climate data + defaults.

## Web Architecture (`web-configurator/`)

- `index.html`: UI layout; loads scripts in dependency order.
- `app-state.js`: global app and dataset state objects.
- `app-data.js`: reads `window.CLIMATE_DATA`, computes per-year averages/ranges, updates initial UI bounds.
- `app-scene.js`: Three.js scene/camera/lights/controls + resize and camera reset logic.
- `app-geometry.js`: procedural disk mesh construction (Catmull-Rom + keyway profile).
- `app-authoritative.js`: optional authoritative STL loading path + manifest/param compatibility checks.
- `app-model.js`: mode-specific model assembly (`single`, `stack`, `grid`, `base`) and mesh lifecycle.
- `app-colors.js`: themes and discrete palette behavior.
- `app-export.js`: browser-side SCAD/STL/3MF export code.
- `app-ui.js`: slider/select wiring, timelapse behavior, hover detail card, main render loop.
- `app.js`: bootstrap sequence.

## Critical Cross-Module Contracts

1. Parameter parity matters:
   - `canonicalParamsFromState()` in `app-authoritative.js` must stay aligned with `CanonicalModelParams` fields/defaults in Python.
   - Mismatch disables authoritative preview and falls back to procedural geometry.
2. Geometry convention:
   - Python/export code treats Z as vertical.
   - Three.js scene uses Y as vertical; `app-authoritative.js` remaps STL axes (`Z-up -> Y-up`).
3. Spline/keyway parity:
   - JS procedural geometry and Python/OpenSCAD implementations should stay behaviorally consistent.

## Common Commands

- Refresh data + regenerate outputs:
  - `python3 main.py`
- Serve web configurator:
  - `python3 main.py --serve-web --web-port 8000`
- Generate one authoritative STL:
  - `python3 main.py --authoritative-year 2024`
- Generate authoritative cache + manifest:
  - `python3 main.py --authoritative-cache --authoritative-cache-years all`
- Docker build/run:
  - `docker build -t climate-spiral .`
  - `docker run --rm -p 8000:8000 -v "$PWD/out:/app/out" climate-spiral --serve-web --web-host 0.0.0.0 --web-port 8000`

## Editing Guidance for Agents

- Prefer small, local changes; this repo has many coupled geometry assumptions.
- Do not manually edit generated artifacts in `out/` unless task explicitly requests generated output changes.
- If changing parameter names/defaults:
  - update Python CLI defaults/constants,
  - update `CanonicalModelParams`,
  - update web state defaults,
  - update `canonicalParamsFromState`,
  - verify authoritative manifest compatibility behavior.
- If changing mesh math:
  - check procedural preview (`app-geometry.js`),
  - check STL/3MF exporters (`app-export.js`),
  - check authoritative path (`openscad_authoritative.py` + `app-authoritative.js`).

## Validation Checklist

1. Run `python3 main.py` and confirm `out/climate_data.js` is regenerated without errors.
2. Launch web app and verify:
   - model builds in all modes (`single`, `stack`, `grid`, `base`),
   - sliders update geometry without console errors,
   - hover details and timeline controls still work.
3. If authoritative path changed:
   - regenerate cache,
   - verify manifest loads and authoritative preview is active when params match,
   - verify fallback to procedural mode when params diverge.
4. If export code changed:
   - exercise STL and 3MF downloads and inspect file naming and rough geometry sanity.

## Current Repository State Notes

- Working tree may already contain user changes (including modified JS/Python files and removed files).
- Do not revert unrelated edits unless explicitly asked.
