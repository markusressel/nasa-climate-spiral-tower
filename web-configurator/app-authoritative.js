const authoritative = {
    enabled: false,
    reason: "Not initialized",
    loader: null,
    geometryCache: new Map(),
    geometryPending: new Map()
};

function canonicalParamsFromState() {
    return {
        baseline_radius: state.baseline,
        scale_factor: state.scale,
        thickness: state.thickness,
        hub_diameter: state.hubDiameter,
        arm_width: state.armWidth,
        cross_thickness: state.crossThickness,
        steps: 120,
        label_text_depth: state.labelTextDepth,
        label_font: state.labelFont,
        label_size: state.labelSize
    };
}

function paramsKeyForCache(params) {
    return JSON.stringify(params);
}

function remapAxesZUpToYUp(geometry) {
    const pos = geometry.attributes && geometry.attributes.position;
    if (!pos) return geometry;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        // Proper right-handed rotation: OpenSCAD Z-up -> Three.js Y-up.
        pos.setXYZ(i, x, z, -y);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

async function initAuthoritativePreview() {
    authoritative.enabled = false;
    authoritative.reason = "Backend API unavailable";
    authoritative.geometryCache.clear();
    authoritative.geometryPending.clear();
    state.authoritativePreviewEnabled = false;
    state.backendApiEnabled = false;

    if (!THREE.STLLoader) {
        authoritative.reason = "THREE.STLLoader not available";
        return;
    }

    try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) {
            authoritative.reason = `Backend health check failed (${res.status})`;
            return;
        }
        authoritative.loader = new THREE.STLLoader();
        authoritative.enabled = true;
        state.authoritativePreviewEnabled = true;
        state.backendApiEnabled = true;
        authoritative.reason = "Using Python backend authoritative preview";
    } catch (err) {
        authoritative.reason = "Backend API not reachable";
        console.warn("Authoritative preview disabled:", err);
    }
}

function isAuthoritativePreviewActive() {
    return state.authoritativePreviewEnabled && authoritative.enabled && state.mode !== 'base';
}

function refreshAuthoritativePreviewCompatibility() {
    // Compatibility is now enforced by server-side param parsing. Keep client enabled unless API fails.
}

async function requestAuthoritativeStlUrl(year, params) {
    const res = await fetch("/api/authoritative/year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, params })
    });
    if (!res.ok) {
        return null;
    }
    const payload = await res.json();
    if (!payload.ok || !payload.stl_url) {
        return null;
    }
    const hashSuffix = payload.params_hash ? `?v=${encodeURIComponent(payload.params_hash)}` : "";
    return payload.stl_url + hashSuffix;
}

function loadAuthoritativeGeometry(year) {
    if (!isAuthoritativePreviewActive()) return Promise.resolve(null);
    const params = canonicalParamsFromState();
    const key = `${paramsKeyForCache(params)}::${year}`;

    if (authoritative.geometryCache.has(key)) {
        return Promise.resolve(authoritative.geometryCache.get(key).clone());
    }
    if (authoritative.geometryPending.has(key)) {
        return authoritative.geometryPending.get(key).then(geom => (geom ? geom.clone() : null));
    }

    const pending = new Promise(async (resolve) => {
        try {
            const stlUrl = await requestAuthoritativeStlUrl(year, params);
            if (!stlUrl) {
                resolve(null);
                return;
            }
            authoritative.loader.load(
                stlUrl,
                (geom) => {
                    remapAxesZUpToYUp(geom);
                    authoritative.geometryCache.set(key, geom);
                    authoritative.geometryPending.delete(key);
                    resolve(geom);
                },
                undefined,
                () => {
                    authoritative.geometryPending.delete(key);
                    resolve(null);
                }
            );
        } catch (_) {
            authoritative.geometryPending.delete(key);
            resolve(null);
        }
    });

    authoritative.geometryPending.set(key, pending);
    return pending.then(geom => (geom ? geom.clone() : null));
}
