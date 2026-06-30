from __future__ import annotations

import os
import subprocess
import tempfile

from .model_params import CanonicalModelParams
from .scad_core import CORE_SCAD_GEOMETRY


def _f(value: float) -> str:
    return f"{value:.8f}".rstrip("0").rstrip(".")


def _arr(values: list[float]) -> str:
    return ", ".join(_f(v) for v in values)


def build_year_disk_scad(
    year: int,
    anomalies: list[float],
    params: CanonicalModelParams,
    prev_anomalies: list[float] | None = None,
    next_anomalies: list[float] | None = None,
) -> str:
    if len(anomalies) != 12:
        raise ValueError("anomalies must contain 12 monthly values")
    if prev_anomalies is not None and len(prev_anomalies) != 12:
        raise ValueError("prev_anomalies must contain 12 monthly values")
    if next_anomalies is not None and len(next_anomalies) != 12:
        raise ValueError("next_anomalies must contain 12 monthly values")
    params.validate()
    prev_vals = prev_anomalies if prev_anomalies is not None else anomalies
    next_vals = next_anomalies if next_anomalies is not None else anomalies

    return f"""// Authoritative single-disk generator (Python -> OpenSCAD)
year = {year};
monthly_anomalies_prev = [{_arr(prev_vals)}];
monthly_anomalies = [{_arr(anomalies)}];
monthly_anomalies_next = [{_arr(next_vals)}];

baseline_radius = {_f(params.baseline_radius)};
scale_factor = {_f(params.scale_factor)};
thickness = {_f(params.thickness)};
hub_diameter = {_f(params.hub_diameter)};

steps = {params.steps};
label_text_depth = {_f(params.label_text_depth)};
label_font = "{params.label_font}";
label_size = {_f(params.label_size)};
arm_width = {_f(params.arm_width)};
cross_thickness = {_f(params.cross_thickness)};
min_ring_thickness = 1.6;
arm_ring_overlap = 1.0;
collar_height = min(2.0, max(0.2, thickness - 0.65));
recess_clearance = 0.0;

{CORE_SCAD_GEOMETRY}

function coverage_target(theta_deg) =
    min(
        interp_from(monthly_anomalies_prev, theta_deg, baseline_radius, scale_factor, hub_diameter),
        interp_from(monthly_anomalies, theta_deg, baseline_radius, scale_factor, hub_diameter),
        interp_from(monthly_anomalies_next, theta_deg, baseline_radius, scale_factor, hub_diameter)
    );

ring_width_required = max([
    for (j = [0:steps-1])
        let(theta = (j / steps) * 360)
        interp_from(monthly_anomalies, theta, baseline_radius, scale_factor, hub_diameter) - coverage_target(theta)
]);
ring_width = max(min_ring_thickness, ring_width_required + 0.2);

climate_disk(
    year = year, 
    anomalies = monthly_anomalies, 
    ring_w = ring_width,
    baseline_radius = baseline_radius, 
    scale_factor = scale_factor, 
    thickness = thickness, 
    hub_diameter = hub_diameter,
    steps = steps, 
    arm_width = arm_width, 
    cross_thickness = cross_thickness,
    label_size = label_size, 
    label_font = label_font, 
    label_text_depth = label_text_depth,
    collar_height = collar_height,
    recess_clearance = recess_clearance
);
"""


def export_year_disk_stl(
    year: int,
    anomalies: list[float],
    params: CanonicalModelParams,
    output_path: str,
    prev_anomalies: list[float] | None = None,
    next_anomalies: list[float] | None = None,
    openscad_bin: str = "openscad",
    openscad_docker_image: str | None = None,
    keep_scad: bool = False,
) -> str:
    scad_src = build_year_disk_scad(year, anomalies, params, prev_anomalies=prev_anomalies, next_anomalies=next_anomalies)
    abs_output_path = os.path.abspath(output_path)
    out_dir = os.path.dirname(abs_output_path) or os.getcwd()
    os.makedirs(out_dir, exist_ok=True)

    with tempfile.NamedTemporaryFile("w", suffix=".scad", delete=False, encoding="utf-8", dir=out_dir) as f:
        f.write(scad_src)
        scad_path = f.name

    try:
        if openscad_docker_image:
            uid = os.getuid()
            gid = os.getgid()
            cmd = [
                "docker",
                "run",
                "--rm",
                "--user",
                f"{uid}:{gid}",
                "-v",
                f"{out_dir}:/io",
                openscad_docker_image,
                "-o",
                f"/io/{os.path.basename(abs_output_path)}",
                f"/io/{os.path.basename(scad_path)}",
            ]
        else:
            cmd = [openscad_bin, "-o", abs_output_path, scad_path]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(
                "OpenSCAD CLI failed.\n"
                f"Command: {' '.join(cmd)}\n"
                f"stdout:\n{proc.stdout}\n"
                f"stderr:\n{proc.stderr}"
            )
    finally:
        if not keep_scad and os.path.exists(scad_path):
            os.unlink(scad_path)

    return output_path
