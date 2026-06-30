import struct

def log(msg: str) -> None:
    print(f"[*] {msg}")

def write_binary_stl(filepath: str, triangles: list[tuple]) -> None:
    with open(filepath, "wb") as f:
        f.write(b"\x00" * 80)
        f.write(struct.pack("<I", len(triangles)))
        for normal, v1, v2, v3 in triangles:
            f.write(struct.pack("<fff", *normal))
            f.write(struct.pack("<fffffffff", *v1, *v2, *v3))
            f.write(struct.pack("<H", 0))