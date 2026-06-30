import math

def catmull_rom(p0: float, p1: float, p2: float, p3: float, u: float) -> float:
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)

def get_interpolated_radius(anomalies: list[float], theta: float, baseline_radius: float, scale_factor: float, hub_diameter: float) -> float:
    t = 12.0 * (theta / (2.0 * math.pi))
    i = int(math.floor(t)) % 12
    u = t - math.floor(t)
    anomaly = catmull_rom(anomalies[(i - 1) % 12], anomalies[i], anomalies[(i + 1) % 12], anomalies[(i + 2) % 12], u)
    return max((hub_diameter / 2.0) + 1.0, baseline_radius + anomaly * scale_factor)

def get_inner_hole_point(theta: float, hole_diameter: float, keyway_type: str, d_shaft_flat: float, notch_width: float, notch_depth: float) -> tuple[float, float]:
    r_hole = hole_diameter / 2.0
    x = r_hole * math.cos(theta)
    y = r_hole * math.sin(theta)
    if keyway_type == "d-shaft":
        x = min(x, r_hole - d_shaft_flat)
    elif keyway_type == "notch" and x > 0 and abs(y) < notch_width / 2.0:
        x = r_hole + notch_depth
    return x, y

def _normal(v1, v2, v3):
    ux, uy, uz = v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]
    wx, wy, wz = v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]
    nx, ny, nz = uy * wz - uz * wy, uz * ux - ux * wz, ux * wy - uy * wx
    l = math.sqrt(nx * nx + ny * ny + nz * nz)
    return (nx / l, ny / l, nz / l) if l > 0 else (0.0, 0.0, 0.0)

def add_box_to_stl(triangles: list, cx: float, cy: float, cz: float, w: float, h: float, d: float) -> None:
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - h / 2, cy + h / 2
    z0, z1 = cz - d / 2, cz + d / 2
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7), (1, 2, 6), (1, 6, 5)]
    for i1, i2, i3 in faces:
        tri = (v[i1], v[i2], v[i3])
        triangles.append((_normal(*tri), *tri))