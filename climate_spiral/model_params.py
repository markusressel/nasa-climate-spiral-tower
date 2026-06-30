from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Any

DEFAULT_LABEL_TEXT_DEPTH = 1.2
DEFAULT_LABEL_FONT = "Liberation Sans:style=Bold"
DEFAULT_LABEL_SIZE = 4.0
DEFAULT_ARM_WIDTH = 4.0
DEFAULT_CROSS_THICKNESS = 2.0


@dataclass(slots=True)
class CanonicalModelParams:
    baseline_radius: float
    scale_factor: float
    thickness: float
    hub_diameter: float
    arm_width: float = DEFAULT_ARM_WIDTH
    cross_thickness: float = DEFAULT_CROSS_THICKNESS
    steps: int = 120
    label_text_depth: float = DEFAULT_LABEL_TEXT_DEPTH
    label_font: str = DEFAULT_LABEL_FONT
    label_size: float = DEFAULT_LABEL_SIZE

    def validate(self) -> None:
        if self.steps < 24:
            raise ValueError("steps must be >= 24 for stable geometry")
        if self.baseline_radius <= 0:
            raise ValueError("baseline_radius must be > 0")
        if self.scale_factor <= 0:
            raise ValueError("scale_factor must be > 0")
        if self.thickness <= 0:
            raise ValueError("thickness must be > 0")
        if self.hub_diameter <= 0:
            raise ValueError("hub_diameter must be > 0")
        if self.arm_width <= 0:
            raise ValueError("arm_width must be > 0")
        if self.cross_thickness <= 0:
            raise ValueError("cross_thickness must be > 0")
        if self.label_text_depth <= 0:
            raise ValueError("label_text_depth must be > 0")
        if self.label_text_depth >= self.thickness:
            raise ValueError("label_text_depth must be < thickness")
        if self.label_size <= 0:
            raise ValueError("label_size must be > 0")

    @classmethod
    def from_namespace(cls, args) -> "CanonicalModelParams":
        params = cls(
            baseline_radius=float(args.baseline_radius),
            scale_factor=float(args.scale_factor),
            thickness=float(args.thickness),
            hub_diameter=float(args.hub_diameter),
            arm_width=float(args.arm_width),
            cross_thickness=float(args.cross_thickness),
        )
        params.validate()
        return params

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "CanonicalModelParams":
        params = cls(
            baseline_radius=float(payload["baseline_radius"]),
            scale_factor=float(payload["scale_factor"]),
            thickness=float(payload["thickness"]),
            hub_diameter=float(payload["hub_diameter"]),
            arm_width=float(payload.get("arm_width", DEFAULT_ARM_WIDTH)),
            cross_thickness=float(payload.get("cross_thickness", DEFAULT_CROSS_THICKNESS)),
            steps=int(payload.get("steps", 120)),
            label_text_depth=float(payload.get("label_text_depth", DEFAULT_LABEL_TEXT_DEPTH)),
            label_font=str(payload.get("label_font", DEFAULT_LABEL_FONT)),
            label_size=float(payload.get("label_size", DEFAULT_LABEL_SIZE)),
        )
        params.validate()
        return params
