import datetime

from .constants import (
    DEFAULT_BASELINE_RADIUS, DEFAULT_HUB_DIAMETER,
    DEFAULT_SCALE_FACTOR, DEFAULT_THICKNESS, SCAD_FILE
)
from .io_utils import log
from .model_params import (
    DEFAULT_ARM_WIDTH,
    DEFAULT_CROSS_THICKNESS,
    DEFAULT_LABEL_FONT,
    DEFAULT_LABEL_SIZE,
    DEFAULT_LABEL_TEXT_DEPTH,
)
from .scad_core import CORE_SCAD_GEOMETRY


def generate_openscad(data: list[tuple[int, list[float]]], filepath: str = SCAD_FILE) -> None:
    log(f"Generating OpenSCAD file '{filepath}'...")
    formatted_rows = []
    for year, anomalies in data:
        formatted_rows.append(f"    [{year}, [{', '.join(f'{v:.2f}' for v in anomalies)}]]")
    climate_data_str = ",\n".join(formatted_rows)

    scad_content = f"""// NASA Climate Spiral 3D-Printable Modular Tower
// Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
// This file is self-contained and renders geometry at top-level.

// View controls (edit in OpenSCAD if needed)
year = {data[-1][0]};
mode = "stack";             // "single", "stack", "grid", "base"
explode_spacing = 0.0;      // mm between disks in stack mode
smooth_steps = 240;         // higher = smoother outer disk boundary
label_text_depth = {DEFAULT_LABEL_TEXT_DEPTH:.2f};    // engraved label depth
label_font = "{DEFAULT_LABEL_FONT}";
label_size = {DEFAULT_LABEL_SIZE:.1f};
arm_width = {DEFAULT_ARM_WIDTH:.1f};
cross_thickness = {DEFAULT_CROSS_THICKNESS:.1f};
min_ring_thickness = 1.6;
arm_ring_overlap = 1.0; // INCREASED to 1.0

// Mechanical defaults
baseline_radius = {DEFAULT_BASELINE_RADIUS:.1f};
hub_diameter = {DEFAULT_HUB_DIAMETER:.1f};
thickness = {DEFAULT_THICKNESS:.1f};
scale_factor = {DEFAULT_SCALE_FACTOR:.1f};

dataset_start_year = {data[0][0]};
climate_data = [
{climate_data_str}
];

$fn = 120;

{CORE_SCAD_GEOMETRY}

function year_index(target_year) =
    let(matches = [for (i = [0:len(climate_data)-1]) if (climate_data[i][0] == target_year) i])
    len(matches) > 0 ? matches[0] : len(climate_data)-1;

function ring_width_for_year(y, anoms) =
    let(
        idx = year_index(y),
        prev_anoms = climate_data[idx > 0 ? idx - 1 : idx][1],
        next_anoms = climate_data[idx < len(climate_data) - 1 ? idx + 1 : idx][1],
        rw_req = max([
            for (j = [0:smooth_steps-1])
                let(
                    theta = (j / smooth_steps) * 360,
                    ro = interp_from(anoms, theta, baseline_radius, scale_factor, hub_diameter),
                    rt = min(
                        interp_from(prev_anoms, theta, baseline_radius, scale_factor, hub_diameter),
                        interp_from(anoms, theta, baseline_radius, scale_factor, hub_diameter),
                        interp_from(next_anoms, theta, baseline_radius, scale_factor, hub_diameter)
                    )
                )
                ro - rt
        ])
    )
    max(min_ring_thickness, rw_req + 0.2);

module disk_for_year(y) {{
    idx = year_index(y);
    anomalies = climate_data[idx][1];
    ring_w = ring_width_for_year(y, anomalies);

    climate_disk(
        year = y, 
        anomalies = anomalies, 
        ring_w = ring_w,
        baseline_radius = baseline_radius, 
        scale_factor = scale_factor, 
        thickness = thickness, 
        hub_diameter = hub_diameter,
        steps = smooth_steps, 
        arm_width = arm_width, 
        cross_thickness = cross_thickness,
        label_size = label_size, 
        label_font = label_font, 
        label_text_depth = label_text_depth,
        collar_height = 2.0,
        recess_clearance = 0.0
    );
}}

module base_plate() {{
    r_base = baseline_radius + 10.0;
    h_base = 6.0;
    union() {{
        translate([0, 0, -h_base]) cylinder(h = h_base, r = r_base, center = false);
        // Smaller male cross pin
        linear_extrude(height = 2.0)
            cross_pattern(hub_diameter / 4.0, cross_thickness / 2.0);
    }}
}}

module stack_layout() {{
    for (i = [0:len(climate_data)-1]) {{
        y = climate_data[i][0];
        z_off = i * (thickness + explode_spacing);
        translate([0, 0, z_off]) disk_for_year(y);
    }}
}}

module grid_layout() {{
    count = len(climate_data);
    cols = ceil(sqrt(count));
    spacing = baseline_radius * 2.2 + scale_factor * 2.0;
    for (i = [0:count-1]) {{
        y = climate_data[i][0];
        col = i % cols;
        row = floor(i / cols);
        x = (col - (cols - 1) / 2) * spacing;
        yoff = (row - (ceil(count / cols) - 1) / 2) * spacing;
        translate([x, yoff, 0]) disk_for_year(y);
    }}
}}

if (mode == "single") {{
    disk_for_year(year);
}} else if (mode == "stack") {{
    stack_layout();
}} else if (mode == "grid") {{
    grid_layout();
}} else if (mode == "base") {{
    base_plate();
}} else {{
    stack_layout();
}}
"""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(scad_content)
    log(f"Successfully generated OpenSCAD script '{filepath}'")
