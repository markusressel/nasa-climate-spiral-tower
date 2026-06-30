import argparse
import http.server
import os
import sys

from .constants import (
    BUILD_DIR, OUT_DIR, SCAD_FILE,
    DEFAULT_BASELINE_RADIUS, DEFAULT_HUB_DIAMETER, DEFAULT_SCALE_FACTOR, DEFAULT_THICKNESS
)
from .authoritative_cache import generate_authoritative_cache
from .data_pipeline import download_data, export_web_data, parse_csv_data
from .io_utils import log
from .model_params import CanonicalModelParams, DEFAULT_ARM_WIDTH, DEFAULT_CROSS_THICKNESS
from .openscad_authoritative import export_year_disk_stl
from .scad_export import generate_openscad
from .web_api import create_web_handler

def serve_web_configurator(
    host: str,
    port: int,
    root_dir: str,
    data: list[tuple[int, list[float]]],
    output_dir: str,
    openscad_bin: str,
    openscad_docker_image: str | None,
) -> None:
    handler_class = create_web_handler(
        directory=root_dir,
        data=data,
        output_dir=output_dir,
        openscad_bin=openscad_bin,
        openscad_docker_image=openscad_docker_image,
    )
    server = http.server.ThreadingHTTPServer((host, port), handler_class)
    log(f"Serving web configurator from '{root_dir}' on http://{host}:{port}/web-configurator/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Web server stopped.")
    finally:
        server.server_close()

def main() -> None:
    parser = argparse.ArgumentParser(
        description="NASA Climate Spiral 3D-Printable Tower Tool",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("-y", "--year", type=int)
    parser.add_argument("-a", "--all-years", action="store_true")
    parser.add_argument("--stack", action="store_true")
    parser.add_argument("--spacing", type=float, default=0.0)
    parser.add_argument("--base", action="store_true")
    parser.add_argument("--baseline-radius", type=float, default=DEFAULT_BASELINE_RADIUS)
    parser.add_argument("--scale-factor", type=float, default=DEFAULT_SCALE_FACTOR)
    parser.add_argument("--thickness", type=float, default=DEFAULT_THICKNESS)
    parser.add_argument("--hub-diameter", type=float, default=DEFAULT_HUB_DIAMETER)
    parser.add_argument("--arm-width", type=float, default=DEFAULT_ARM_WIDTH, help="Width of radial support arms")
    parser.add_argument("--cross-thickness", type=float, default=DEFAULT_CROSS_THICKNESS, help="Width of plug/socket cross bars")
    parser.add_argument("--no-emboss", action="store_true")
    parser.add_argument("--stl", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--output-dir", default=OUT_DIR)
    parser.add_argument("--authoritative-year", type=int, help="Generate authoritative STL for one year using OpenSCAD text() labels")
    parser.add_argument("--openscad-bin", default="openscad", help="OpenSCAD executable path")
    parser.add_argument("--openscad-docker-image", default=None, help="Docker image name for OpenSCAD execution (uses 'docker run')")
    parser.add_argument("--keep-authoritative-scad", action="store_true", help="Keep temporary generated SCAD file for debugging")
    parser.add_argument("--authoritative-cache", action="store_true", help="Generate authoritative STL cache + manifest for browser preview parity")
    parser.add_argument("--authoritative-cache-years", default="all", help="Comma-separated year list for authoritative cache generation, or 'all'")
    parser.add_argument("--serve-web", action="store_true", help="Start a local HTTP server for the web configurator")
    parser.add_argument("--web-host", default="0.0.0.0", help="Host/interface for the web configurator server")
    parser.add_argument("--web-port", type=int, default=8000, help="Port for the web configurator server")
    args = parser.parse_args()

    os.makedirs(BUILD_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    csv_text = download_data(force=args.force)
    try:
        data = parse_csv_data(csv_text)
    except Exception as e:
        log(f"Error parsing GISTEMP CSV data: {e}")
        sys.exit(1)

    log(f"Successfully loaded global dataset from {data[0][0]} to {data[-1][0]} ({len(data)} years)")
    export_web_data(data)
    generate_openscad(data, SCAD_FILE)

    if args.authoritative_year is not None:
        year_to_export = args.authoritative_year
        lookup = {year: anomalies for year, anomalies in data}
        if year_to_export not in lookup:
            log(f"Error: year {year_to_export} not in dataset range {data[0][0]}-{data[-1][0]}")
            sys.exit(1)

        params = CanonicalModelParams.from_namespace(args)
        out_name = f"climate_spiral_authoritative_{year_to_export}.stl"
        out_path = os.path.join(args.output_dir, out_name)
        years = [year for year, _ in data]
        year_pos = years.index(year_to_export)
        prev_year = years[year_pos - 1] if year_pos > 0 else year_to_export
        next_year = years[year_pos + 1] if year_pos < len(years) - 1 else year_to_export
        log(f"Generating authoritative OpenSCAD STL for {year_to_export} -> '{out_path}'")
        try:
            export_year_disk_stl(
                year=year_to_export,
                anomalies=lookup[year_to_export],
                params=params,
                output_path=out_path,
                prev_anomalies=lookup[prev_year],
                next_anomalies=lookup[next_year],
                openscad_bin=args.openscad_bin,
                openscad_docker_image=args.openscad_docker_image,
                keep_scad=args.keep_authoritative_scad,
            )
        except Exception as e:
            log(f"Authoritative OpenSCAD export failed: {e}")
            sys.exit(1)
        log("Authoritative single-year STL export completed successfully.")

    if args.authoritative_cache:
        params = CanonicalModelParams.from_namespace(args)
        try:
            generate_authoritative_cache(
                data=data,
                params=params,
                output_dir=args.output_dir,
                openscad_bin=args.openscad_bin,
                openscad_docker_image=args.openscad_docker_image,
                years_selection=args.authoritative_cache_years,
            )
        except Exception as e:
            log(f"Authoritative cache generation failed: {e}")
            sys.exit(1)
        log("Authoritative cache generation completed successfully.")

    # Keep STL export call here once extracted to its own module
    if args.stl or args.base:
        log("STL export module extraction step: wire your existing STL export function here.")
    elif not args.serve_web:
        log("STL generation not requested. Run with --stl or --base.")

    if args.serve_web:
        serve_web_configurator(
            host=args.web_host,
            port=args.web_port,
            root_dir=os.getcwd(),
            data=data,
            output_dir=args.output_dir,
            openscad_bin=args.openscad_bin,
            openscad_docker_image=args.openscad_docker_image,
        )
    else:
        log("All tasks completed successfully!")


if __name__ == "__main__":
    main()
