from __future__ import annotations

import datetime
import hashlib
import json
import os

from .io_utils import log
from .model_params import CanonicalModelParams
from .openscad_authoritative import export_year_disk_stl

AUTHORITATIVE_GEOMETRY_VERSION = 29


def canonical_params_dict(params: CanonicalModelParams) -> dict:
    params.validate()
    return {
        "geometry_version": AUTHORITATIVE_GEOMETRY_VERSION,
        "baseline_radius": params.baseline_radius,
        "scale_factor": params.scale_factor,
        "thickness": params.thickness,
        "hub_diameter": params.hub_diameter,
        "arm_width": params.arm_width,
        "cross_thickness": params.cross_thickness,
        "steps": params.steps,
        "label_text_depth": params.label_text_depth,
        "label_font": params.label_font,
        "label_size": params.label_size,
    }


def params_hash(params: CanonicalModelParams) -> str:
    payload = json.dumps(canonical_params_dict(params), sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def parse_year_selection(selection: str | None, all_years: list[int]) -> list[int]:
    if not selection or selection.strip() == "all":
        return list(all_years)
    allowed = set(all_years)
    years: list[int] = []
    for token in selection.split(","):
        token = token.strip()
        if not token:
            continue
        year = int(token)
        if year not in allowed:
            raise ValueError(f"Year {year} not present in dataset")
        years.append(year)
    deduped = sorted(set(years))
    if not deduped:
        raise ValueError("No valid years selected")
    return deduped


def generate_authoritative_cache(
    data: list[tuple[int, list[float]]],
    params: CanonicalModelParams,
    output_dir: str,
    openscad_bin: str = "openscad",
    openscad_docker_image: str | None = None,
    years_selection: str | None = None,
) -> str:
    params.validate()
    year_to_anomalies = {year: anomalies for year, anomalies in data}
    all_years = [year for year, _ in data]
    year_index = {year: idx for idx, year in enumerate(all_years)}
    years = parse_year_selection(years_selection, all_years)

    cache_root = os.path.join(output_dir, "authoritative")
    hash_id = params_hash(params)
    cache_dir = os.path.join(cache_root, hash_id)
    os.makedirs(cache_dir, exist_ok=True)

    log(f"Authoritative cache hash: {hash_id}")
    for year in years:
        out_stl = os.path.join(cache_dir, f"disk_{year}.stl")
        if os.path.exists(out_stl):
            continue
        idx = year_index[year]
        prev_year = all_years[idx - 1] if idx > 0 else year
        next_year = all_years[idx + 1] if idx < len(all_years) - 1 else year
        export_year_disk_stl(
            year=year,
            anomalies=year_to_anomalies[year],
            params=params,
            output_path=out_stl,
            prev_anomalies=year_to_anomalies[prev_year],
            next_anomalies=year_to_anomalies[next_year],
            openscad_bin=openscad_bin,
            openscad_docker_image=openscad_docker_image,
            keep_scad=False,
        )
        log(f"Generated authoritative STL for {year}: {out_stl}")

    manifest = {
        "version": 1,
        "generated_at": datetime.datetime.now().isoformat(),
        "params_hash": hash_id,
        "params": canonical_params_dict(params),
        "years": {str(year): f"{hash_id}/disk_{year}.stl" for year in years},
    }

    os.makedirs(cache_root, exist_ok=True)
    manifest_path = os.path.join(cache_root, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    log(f"Wrote authoritative cache manifest: {manifest_path}")
    return manifest_path
