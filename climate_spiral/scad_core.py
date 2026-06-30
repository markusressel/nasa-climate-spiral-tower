CORE_SCAD_GEOMETRY = """
// --- SHARED CORE GEOMETRY (STATELESS) ---

// Internal fit/tolerance constants for the cross plug/socket interface.
PLUG_SOCKET_CLEARANCE_XY = 0.15;
SOCKET_EXTRA_DEPTH = 0.20;
SOCKET_TOP_SKIN_MIN = 0.45;
MIN_FEATURE_Z = 0.20;

function catmull_rom(p0, p1, p2, p3, u) =
    0.5 * (
        (2 * p1) +
        (-p0 + p2) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
        (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u
    );

function radius_for_anomaly(a, baseline_radius, scale_factor) = baseline_radius + a * scale_factor;

function interpolated_radius(anomalies, theta_deg, baseline_radius, scale_factor, hub_diameter) =
    let(
        t = 12 * (theta_deg / 360),
        i = floor(t) % 12,
        u = t - floor(t),
        p0 = anomalies[(i - 1 + 12) % 12],
        p1 = anomalies[i],
        p2 = anomalies[(i + 1) % 12],
        p3 = anomalies[(i + 2) % 12],
        anomaly = catmull_rom(p0, p1, p2, p3, u),
        min_radius = (hub_diameter / 2) + 1
    )
    max(min_radius, radius_for_anomaly(anomaly, baseline_radius, scale_factor));

function interp_from(anoms, theta_deg, baseline_radius, scale_factor, hub_diameter) =
    interpolated_radius(anoms, theta_deg, baseline_radius, scale_factor, hub_diameter);

function inner_radius_for_year(anoms, theta_deg, ring_w, baseline_radius, scale_factor, hub_diameter) =
    let(
        ro = interp_from(anoms, theta_deg, baseline_radius, scale_factor, hub_diameter)
    )
    max(0, ro - ring_w);

function socket_max_depth(thickness) = max(MIN_FEATURE_Z, thickness - SOCKET_TOP_SKIN_MIN);

function plug_height_for_thickness(thickness) =
    let(socket_d = socket_max_depth(thickness))
    max(MIN_FEATURE_Z, socket_d - SOCKET_EXTRA_DEPTH);

function socket_depth_for_thickness(thickness) =
    let(
        socket_d = socket_max_depth(thickness),
        plug_h = plug_height_for_thickness(thickness)
    )
    socket_d <= plug_h ? min(thickness - 0.01, plug_h + 0.05) : socket_d;

function marker_length_for_label(label_size, arm_width) =
    max(arm_width * 1.9, label_size * 2.1 + 0.9);

function marker_width_for_label(label_size, arm_width) =
    max(arm_width * 3.6, label_size * 5.0 + 1.6);

function marker_corner_radius(marker_w, arm_width) =
    min(marker_w * 0.22, arm_width * 0.75);

module cross_pattern(r, w) {
    union() {
        square([r * 2, w], center = true);
        square([w, r * 2], center = true);
    }
}

module smooth_ring_profile(anomalies, ring_w, steps, thickness, baseline_radius, scale_factor, hub_diameter) {
    outer_pts = [
        for (j = [0:steps-1])
            let(
                theta = (j / steps) * 360,
                r = interp_from(anomalies, theta, baseline_radius, scale_factor, hub_diameter)
            )
            [r * cos(theta), r * sin(theta)]
    ];
    inner_pts = [
        for (j = [steps-1:-1:0])
            let(
                theta = (j / steps) * 360,
                ri = inner_radius_for_year(anomalies, theta, ring_w, baseline_radius, scale_factor, hub_diameter)
            )
            [ri * cos(theta), ri * sin(theta)]
    ];
    linear_extrude(height = thickness)
        polygon(points = concat(outer_pts, inner_pts));
}

module filled_outer_shape(anomalies, steps, thickness, baseline_radius, scale_factor, hub_diameter) {
    outer_pts = [
        for (j = [0:steps-1])
            let(
                theta = (j / steps) * 360,
                r = interp_from(anomalies, theta, baseline_radius, scale_factor, hub_diameter)
            )
            [r * cos(theta), r * sin(theta)]
    ];
    linear_extrude(height = thickness)
        polygon(points = outer_pts);
}

module radial_arms_and_marker(anomalies, ring_w, thickness, arm_width, label_size, baseline_radius, scale_factor, hub_diameter) {
    r_hub = hub_diameter / 2;
    arm_r = arm_width / 2;

    arm_len_0 = interp_from(anomalies, 0, baseline_radius, scale_factor, hub_diameter) + 10.0;
    arm_len_90 = interp_from(anomalies, 90, baseline_radius, scale_factor, hub_diameter) + 10.0;
    arm_len_180 = interp_from(anomalies, 180, baseline_radius, scale_factor, hub_diameter) + 10.0;
    arm_len_270 = interp_from(anomalies, 270, baseline_radius, scale_factor, hub_diameter) + 10.0;

    module arm_capsule(arm_len) {
        linear_extrude(height = thickness)
            translate([0, -arm_r]) square([arm_len, arm_width]);
    }

    arm_capsule(arm_len_0);
    rotate([0, 0, 90]) arm_capsule(arm_len_90);
    rotate([0, 0, 180]) arm_capsule(arm_len_180);
    rotate([0, 0, 270]) arm_capsule(arm_len_270);

    outer_0 = interp_from(anomalies, 0, baseline_radius, scale_factor, hub_diameter);
    inner_0 = inner_radius_for_year(anomalies, 0, ring_w, baseline_radius, scale_factor, hub_diameter);

    // Keep extra clearance at small text sizes; large sizes still scale predictably.
    marker_len = marker_length_for_label(label_size, arm_width);
    marker_w = marker_width_for_label(label_size, arm_width);

    marker_cx = inner_0 - marker_len / 2;
    marker_corner_r = marker_corner_radius(marker_w, arm_width);

    ring_thickness_0 = outer_0 - inner_0;
    tab_rect_length = marker_len + ring_thickness_0 + 10.0;
    tab_x0 = marker_cx - marker_len / 2;
    tab_rect_w = max(0.1, tab_rect_length - marker_corner_r);
    tab_center_w = max(0.1, marker_w - 2 * marker_corner_r);

    linear_extrude(height = thickness)
        union() {
            // Right/main body of tab.
            translate([tab_x0 + marker_corner_r, -marker_w / 2])
                square([tab_rect_w, marker_w], center = false);
            // Left center strip keeps width bounded while corners are rounded.
            translate([tab_x0, -marker_w / 2 + marker_corner_r])
                square([marker_corner_r, tab_center_w], center = false);
            // Rounded inner corners (towards center) without circular overhang.
            translate([tab_x0 + marker_corner_r, marker_w / 2 - marker_corner_r])
                circle(r = marker_corner_r);
            translate([tab_x0 + marker_corner_r, -marker_w / 2 + marker_corner_r])
                circle(r = marker_corner_r);
        }
}

module year_label_cut(y, anomalies, ring_w, thickness, label_text_depth, label_size, label_font, arm_width, baseline_radius, scale_factor, hub_diameter) {
    inner_0 = inner_radius_for_year(anomalies, 0, ring_w, baseline_radius, scale_factor, hub_diameter);
    marker_len = marker_length_for_label(label_size, arm_width);
    marker_cx = inner_0 - marker_len / 2;

    translate([marker_cx, 0, thickness - label_text_depth])
        linear_extrude(height = label_text_depth + 0.001)
            rotate([0, 0, -90])
                text(str(y), size = label_size, font = label_font, halign = "center", valign = "center");
}

module climate_disk(
    year, anomalies, ring_w,
    baseline_radius, scale_factor, thickness, hub_diameter,
    steps, arm_width, cross_thickness, label_size, label_font, label_text_depth,
    collar_height, recess_clearance
) {
    r_hub = hub_diameter / 2.0;
    plug_height = plug_height_for_thickness(thickness);
    recess_depth = socket_depth_for_thickness(thickness);

    difference() {
        union() {
            smooth_ring_profile(anomalies, ring_w, steps, thickness, baseline_radius, scale_factor, hub_diameter);
            intersection() {
                radial_arms_and_marker(anomalies, ring_w, thickness, arm_width, label_size, baseline_radius, scale_factor, hub_diameter);
                filled_outer_shape(anomalies, steps, thickness, baseline_radius, scale_factor, hub_diameter);
            }
            // Top male plug cross.
            translate([0, 0, thickness]) 
                linear_extrude(height = min(collar_height, plug_height))
                    cross_pattern(r_hub / 2.0, cross_thickness / 2.0);
        }

        // Bottom female socket cross, deeper and wider than the top plug.
        translate([0, 0, -0.05]) 
            linear_extrude(height = recess_depth + 0.1)
                cross_pattern(
                    r_hub / 2.0 + recess_clearance + PLUG_SOCKET_CLEARANCE_XY,
                    cross_thickness / 2.0 + ((recess_clearance + PLUG_SOCKET_CLEARANCE_XY) * 2)
                );

        year_label_cut(year, anomalies, ring_w, thickness, label_text_depth, label_size, label_font, arm_width, baseline_radius, scale_factor, hub_diameter);
    }
}
"""