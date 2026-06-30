// 4. Mesh Generation Math
function catmullRom(p0, p1, p2, p3, u) {
    return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
        (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u
    );
}

function getInterpolatedRadius(anomalies, theta, baseline, scale, hubDiameter) {
    const t = 12.0 * (theta / (2.0 * Math.PI));
    const i = Math.floor(t) % 12;
    const u = t - Math.floor(t);
    
    const p0 = anomalies[(i - 1 + 12) % 12];
    const p1 = anomalies[i];
    const p2 = anomalies[(i + 1) % 12];
    const p3 = anomalies[(i + 2) % 12];
    
    const anomaly = catmullRom(p0, p1, p2, p3, u);
    const r = baseline + anomaly * scale;
    
    const minRadius = (hubDiameter / 2.0) + 1.0;
    return Math.max(minRadius, r);
}

function getCrossRadius(theta, armRadius, armHalfWidth) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const eps = 1e-9;
    const ax = Math.max(Math.abs(c), eps);
    const ay = Math.max(Math.abs(s), eps);

    const tRectA = Math.min(armRadius / ax, armHalfWidth / ay);
    const tRectB = Math.min(armHalfWidth / ax, armRadius / ay);
    return Math.max(tRectA, tRectB);
}

function getCrossPoint(theta, armRadius, armHalfWidth) {
    const t = getCrossRadius(theta, armRadius, armHalfWidth);
    return { x: t * Math.cos(theta), y: t * Math.sin(theta) };
}

function buildDiskGeometry(anomalies) {
    const steps = 120;

    const crossThickness = Math.max(0.1, state.crossThickness || 4.0);
    const armHalfWidth = crossThickness / 2.0;
    const crossArmRadius = state.hubDiameter / 4.0;
    const socketExtraDepth = 0.20;
    const socketTopSkinMin = 0.45;
    const minFeatureZ = 0.20;
    const plugSocketClearanceXY = 0.15;

    const socketMaxDepth = Math.max(minFeatureZ, state.thickness - socketTopSkinMin);
    const plugHeightRaw = Math.max(minFeatureZ, socketMaxDepth - socketExtraDepth);
    const collarHeight = Math.min(2.0, plugHeightRaw);

    const rPlugArm = crossArmRadius;
    const wPlugArm = armHalfWidth;
    const rSocketArm = crossArmRadius + plugSocketClearanceXY;
    const wSocketArm = armHalfWidth + plugSocketClearanceXY;

    const rHub = state.hubDiameter / 2.0;
    const dRecess = socketMaxDepth;
    const thick = state.thickness;
    
    const sectorVertices = [];
    for (let j = 0; j < steps; j++) {
        const theta = (j / steps) * (2.0 * Math.PI);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        
        // 1. Center point (no shaft hole)
        const xh = 0.0;
        const yh = 0.0;

        // 2. Plug footprint (cross)
        const ptC = getCrossPoint(theta, rPlugArm, wPlugArm);

        // 3. Socket footprint (cross, slightly looser)
        const ptR = getCrossPoint(theta, rSocketArm, wSocketArm);

        // 4. Hub
        const xHub = rHub * cosT;
        const yHub = rHub * sinT;
        
        // 5. Spline
        const rS = getInterpolatedRadius(anomalies, theta, state.baseline, state.scale, state.hubDiameter);
        const xs = rS * cosT;
        const ys = rS * sinT;
        
        // Vertices at base Y = 0 in Three.js coordinates:
        // Python's (x, y, z) maps to Three.js's (x, z, y).
        const v0 = [xh, yh, dRecess];
        const v1 = [xh, yh, thick + collarHeight];
        const v2 = [ptC.x, ptC.y, thick + collarHeight];
        const v3 = [ptC.x, ptC.y, thick];
        const v4 = [xHub, yHub, thick];
        const v5 = [xs, ys, thick];
        const v6 = [xs, ys, 0];
        const v7 = [xHub, yHub, 0];
        const v8 = [ptR.x, ptR.y, 0];
        const v9 = [ptR.x, ptR.y, dRecess];
        
        sectorVertices.push([v0, v1, v2, v3, v4, v5, v6, v7, v8, v9]);
    }
    
    const positions = [];
    for (let k = 0; k < steps; k++) {
        const kp1 = (k + 1) % steps;
        const vK = sectorVertices[k];
        const vKp1 = sectorVertices[kp1];
        
        for (let a = 0; a < 10; a++) {
            const b = (a + 1) % 10;
            const a1 = vK[a];
            const b1 = vK[b];
            const a2 = vKp1[a];
            const b2 = vKp1[b];
            
            // Triangle 1: a1 -> b2 -> a2
            positions.push(a1[0], a1[2], a1[1]);
            positions.push(b2[0], b2[2], b2[1]);
            positions.push(a2[0], a2[2], a2[1]);
            
            // Triangle 2: a1 -> b1 -> b2
            positions.push(a1[0], a1[2], a1[1]);
            positions.push(b1[0], b1[2], b1[1]);
            positions.push(b2[0], b2[2], b2[1]);
        }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
}
