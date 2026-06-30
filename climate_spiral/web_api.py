from __future__ import annotations

import json
import math
import os
import struct
import zipfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from typing import Any
from urllib.parse import urlparse

from .authoritative_cache import params_hash
from .io_utils import log
from .model_params import CanonicalModelParams
from .openscad_authoritative import export_year_disk_stl


def _read_binary_stl_triangles(filepath: str) -> list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]]:
    with open(filepath, "rb") as f:
        raw = f.read()
    if len(raw) < 84:
        raise ValueError(f"Invalid STL file (too short): {filepath}")
    tri_count = struct.unpack("<I", raw[80:84])[0]
    expected = 84 + tri_count * 50
    if len(raw) != expected:
        raise ValueError(f"Unsupported STL encoding for {filepath}; expected binary STL")
    triangles = []
    off = 84
    for _ in range(tri_count):
        # normal ignored
        off += 12
        v1 = struct.unpack("<fff", raw[off:off + 12])
        off += 12
        v2 = struct.unpack("<fff", raw[off:off + 12])
        off += 12
        v3 = struct.unpack("<fff", raw[off:off + 12])
        off += 12
        off += 2  # attribute byte count
        triangles.append((v1, v2, v3))
    return triangles


def _read_ascii_stl_triangles(filepath: str) -> list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]]:
    triangles: list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]] = []
    vertices: list[tuple[float, float, float]] = []
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line.startswith("vertex "):
                continue
            parts = line.split()
            if len(parts) != 4:
                continue
            vx = float(parts[1])
            vy = float(parts[2])
            vz = float(parts[3])
            vertices.append((vx, vy, vz))
            if len(vertices) == 3:
                triangles.append((vertices[0], vertices[1], vertices[2]))
                vertices.clear()
    if not triangles:
        raise ValueError(f"Unsupported STL encoding for {filepath}; expected binary or ASCII STL")
    return triangles


def _read_stl_triangles(filepath: str) -> list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]]:
    try:
        return _read_binary_stl_triangles(filepath)
    except ValueError:
        return _read_ascii_stl_triangles(filepath)


def _build_3mf_model_xml(
    object_meshes: list[
        tuple[
            int,
            list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]],
            str | None,
        ]
    ],
    palette_colors: list[str] | None = None,
) -> str:
    # If palette_colors is not provided, build it from unique object colors in order of appearance
    if not palette_colors:
        seen = set()
        palette_colors = []
        for _object_id, _triangles, color in object_meshes:
            safe_color = color if isinstance(color, str) and color.startswith("#") and len(color) == 9 else "#CCCCCCFF"
            if safe_color not in seen:
                seen.add(safe_color)
                palette_colors.append(safe_color)
        if not palette_colors:
            palette_colors = ["#CCCCCCFF"]

    lines: list[str] = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">')
    lines.append('  <metadata name="Application">BambuStudio-02.05.03.61</metadata>')
    lines.append("  <resources>")
    lines.append('    <basematerials id="1">')
    for idx, color in enumerate(palette_colors):
        lines.append(f'      <base name="Filament_{idx + 1}" displaycolor="{color}"/>')
    lines.append("    </basematerials>")

    for object_id, triangles, color in object_meshes:
        safe_color = color if isinstance(color, str) and color.startswith("#") and len(color) == 9 else "#CCCCCCFF"
        try:
            pindex = palette_colors.index(safe_color)
        except ValueError:
            pindex = 0

        vertices: list[tuple[float, float, float]] = []
        vertex_index: dict[tuple[float, float, float], int] = {}
        tri_indices: list[tuple[int, int, int]] = []

        def _vertex_key(v: tuple[float, float, float]) -> tuple[float, float, float]:
            # Quantize to stabilize indexing across ASCII float parse noise.
            return (round(v[0], 6), round(v[1], 6), round(v[2], 6))

        for v1, v2, v3 in triangles:
            tri = []
            for v in (v1, v2, v3):
                key = _vertex_key(v)
                idx = vertex_index.get(key)
                if idx is None:
                    idx = len(vertices)
                    vertex_index[key] = idx
                    vertices.append((v[0], v[1], v[2]))
                tri.append(idx)
            tri_indices.append((tri[0], tri[1], tri[2]))

        if pindex == 0:
            paint_color_code = "4"
        elif pindex == 1:
            paint_color_code = "8"
        else:
            paint_color_code = f"{hex(pindex - 2)[2:].upper()}C"

        lines.append(f'    <object id="{object_id}" type="model" pid="1" pindex="{pindex}">')
        lines.append("      <mesh>")
        lines.append("        <vertices>")
        for vx, vy, vz in vertices:
            lines.append(f'          <vertex x="{vx:.5f}" y="{vy:.5f}" z="{vz:.5f}"/>')
        lines.append("        </vertices>")
        lines.append("        <triangles>")
        for i1, i2, i3 in tri_indices:
            lines.append(f'          <triangle v1="{i1}" v2="{i2}" v3="{i3}" paint_color="{paint_color_code}"/>')
        lines.append("        </triangles>")
        lines.append("      </mesh>")
        lines.append("    </object>")
    lines.append("  </resources>")
    lines.append("  <build>")
    for object_id, _, _ in object_meshes:
        lines.append(f'    <item objectid="{object_id}"/>')
    lines.append("  </build>")
    lines.append("</model>")
    return "\n".join(lines)


def _write_3mf(output_path: str, stl_paths: list[str], spacing: float, object_colors: list[str | None] | None = None, palette_colors: list[str] | None = None) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    count = len(stl_paths)
    cols = max(1, math.ceil(math.sqrt(count)))
    rows = max(1, math.ceil(count / cols))
    meshes: list[
        tuple[
            int,
            list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]],
            str | None,
        ]
    ] = []
    for idx, stl_path in enumerate(stl_paths):
        col = idx % cols
        row = idx // cols
        x_off = (col - (cols - 1) / 2.0) * spacing
        y_off = (row - (rows - 1) / 2.0) * spacing
        translated = []
        for v1, v2, v3 in _read_stl_triangles(stl_path):
            t1 = (v1[0] + x_off, v1[1] + y_off, v1[2])
            t2 = (v2[0] + x_off, v2[1] + y_off, v2[2])
            t3 = (v3[0] + x_off, v3[1] + y_off, v3[2])
            translated.append((t1, t2, t3))
        color = None
        if object_colors is not None and idx < len(object_colors):
            color = object_colors[idx]
        meshes.append((idx + 1, translated, color))
    model_xml = _build_3mf_model_xml(meshes, palette_colors)
    config_lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>']
    for obj_id, _translated, color in meshes:
        safe_color = color if isinstance(color, str) and color.startswith("#") and len(color) == 9 else "#CCCCCCFF"
        try:
            pindex = palette_colors.index(safe_color) if palette_colors else 0
        except ValueError:
            pindex = 0
        extruder_val = pindex + 1
        config_lines.append(f'  <object id="{obj_id}">')
        config_lines.append(f'    <metadata key="extruder" value="{extruder_val}"/>')
        config_lines.append('  </object>')
    config_lines.append('</config>')
    config_xml = "\n".join(config_lines)

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
""",
        )
        zf.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/>
</Relationships>
""",
        )
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/model_settings.config", config_xml)


def _json_response(handler: SimpleHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def create_web_handler(
    *,
    directory: str,
    data: list[tuple[int, list[float]]],
    output_dir: str,
    openscad_bin: str,
    openscad_docker_image: str | None,
):
    year_to_anomalies = {year: anomalies for year, anomalies in data}
    all_years = [year for year, _ in data]
    year_index = {year: idx for idx, year in enumerate(all_years)}

    class ClimateRequestHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=directory, **kwargs)

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/health":
                _json_response(
                    self,
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "start_year": data[0][0],
                        "end_year": data[-1][0],
                    },
                )
                return
            if parsed.path == "/api/dataset":
                years = [year for year, _ in data]
                monthly = {str(year): anomalies for year, anomalies in data}
                _json_response(
                    self,
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "metadata": {
                            "start_year": years[0],
                            "end_year": years[-1],
                            "total_years": len(years),
                        },
                        "years": years,
                        "monthly_anomalies": monthly,
                    },
                )
                return
            super().do_GET()

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/authoritative/year":
                self._handle_authoritative_year()
                return
            if parsed.path == "/api/export/3mf":
                self._handle_export_3mf()
                return
            _json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown endpoint"})

        def _read_json_payload(self) -> dict[str, Any]:
            content_len = int(self.headers.get("Content-Length", "0") or "0")
            if content_len <= 0:
                return {}
            raw = self.rfile.read(content_len)
            return json.loads(raw.decode("utf-8"))

        def _parse_params(self, payload: dict[str, Any]) -> CanonicalModelParams:
            params_payload = payload.get("params")
            if not isinstance(params_payload, dict):
                raise ValueError("Missing 'params' object")
            return CanonicalModelParams.from_mapping(params_payload)

        def _resolve_cached_stl(self, year: int, params: CanonicalModelParams) -> tuple[str, str]:
            if year not in year_to_anomalies:
                raise ValueError(f"Year {year} is outside dataset range")
            hash_id = params_hash(params)
            cache_dir = os.path.join(output_dir, "authoritative", hash_id)
            os.makedirs(cache_dir, exist_ok=True)
            out_stl = os.path.join(cache_dir, f"disk_{year}.stl")
            if not os.path.exists(out_stl):
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
            return hash_id, out_stl

        def _handle_authoritative_year(self) -> None:
            try:
                payload = self._read_json_payload()
                year = int(payload["year"])
                params = self._parse_params(payload)
                hash_id, out_stl = self._resolve_cached_stl(year, params)
            except Exception as exc:
                _json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
                return
            rel_url = "/" + os.path.relpath(out_stl, directory).replace(os.sep, "/")
            _json_response(
                self,
                HTTPStatus.OK,
                {"ok": True, "year": year, "params_hash": hash_id, "stl_url": rel_url},
            )

        def _handle_export_3mf(self) -> None:
            try:
                payload = self._read_json_payload()
                params = self._parse_params(payload)
                years = payload.get("years")
                year_colors = payload.get("year_colors")
                if not isinstance(years, list) or not years:
                    raise ValueError("'years' must be a non-empty array")
                years_int = sorted({int(y) for y in years})
                stl_paths = []
                object_colors: list[str | None] = []
                hash_id: str | None = None
                for year in years_int:
                    current_hash, stl_path = self._resolve_cached_stl(year, params)
                    hash_id = hash_id or current_hash
                    stl_paths.append(stl_path)
                    color = None
                    if isinstance(year_colors, dict):
                        raw = year_colors.get(str(year))
                        if isinstance(raw, str) and len(raw) == 7 and raw.startswith("#"):
                            hex_part = raw[1:]
                            if all(ch in "0123456789abcdefABCDEF" for ch in hex_part):
                                color = f"{raw.upper()}FF"
                    object_colors.append(color)
                palette_colors_raw = payload.get("palette_colors")
                palette_colors: list[str] = []
                if isinstance(palette_colors_raw, list):
                    for c in palette_colors_raw:
                        if isinstance(c, str) and len(c) == 9 and c.startswith("#"):
                            hex_part = c[1:]
                            if all(ch in "0123456789abcdefABCDEF" for ch in hex_part):
                                palette_colors.append(c.upper())

                exports_dir = os.path.join(output_dir, "exports")
                os.makedirs(exports_dir, exist_ok=True)
                out_name = f"climate_spiral_authoritative_{years_int[0]}_{years_int[-1]}_{hash_id}.3mf"
                out_path = os.path.join(exports_dir, out_name)
                spacing = float(payload.get("spacing", max(20.0, params.baseline_radius * 2.6)))
                _write_3mf(out_path, stl_paths, spacing=spacing, object_colors=object_colors, palette_colors=palette_colors)
                rel_url = "/" + os.path.relpath(out_path, directory).replace(os.sep, "/")
                _json_response(
                    self,
                    HTTPStatus.OK,
                    {"ok": True, "download_url": rel_url, "year_count": len(years_int)},
                )
                log(f"Generated authoritative 3MF export: {out_path}")
            except Exception as exc:
                _json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    return ClimateRequestHandler
