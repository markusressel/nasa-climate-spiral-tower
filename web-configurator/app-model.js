// 5. Assemble 3D Model
let currentBuildId = 0;
let rebuildTimer = null;

function scheduleModelRebuild(delayMs = 140) {
    if (rebuildTimer) {
        clearTimeout(rebuildTimer);
    }
    rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        build3DModel();
    }, delayMs);
}

function setModelLoading(active, message = "", done = null, total = null) {
    const overlay = document.getElementById('model-loading-overlay');
    const textEl = document.getElementById('model-loading-text');
    const subEl = document.getElementById('model-loading-subtext');
    if (!overlay || !textEl || !subEl) return;

    if (!active) {
        overlay.classList.remove('visible');
        return;
    }
    textEl.textContent = message || "Building model...";
    if (done != null && total != null && total > 0) {
        const pct = Math.min(100, Math.round((done / total) * 100));
        subEl.textContent = `${done}/${total} disks (${pct}%)`;
    } else {
        subEl.textContent = "Preparing geometry...";
    }
    overlay.classList.add('visible');
}

function getPreviewLoadConcurrency(total) {
    const cores = navigator.hardwareConcurrency || 8;
    const target = Math.max(4, Math.floor(cores * 0.75));
    return Math.min(Math.max(1, total), Math.min(12, target));
}

async function loadGeometryBatch(years, buildId, label, onItemLoaded = null) {
    const total = years.length;
    const results = new Array(total);
    if (total === 0) return results;

    let nextIndex = 0;
    let done = 0;
    const concurrency = getPreviewLoadConcurrency(total);

    setModelLoading(true, label, done, total);

    const worker = async () => {
        while (true) {
            if (buildId !== currentBuildId) return;
            const i = nextIndex++;
            if (i >= total) return;

            const year = years[i];
            const anomalies = dataset.anomalies[year];
            const src = await getGeometrySource(year, anomalies);
            if (buildId !== currentBuildId) return;

            results[i] = { year, src };
            done += 1;
            setModelLoading(true, label, done, total);

            if (typeof onItemLoaded === "function") {
                onItemLoaded(i, year, src, done, total);
            }
        }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (buildId !== currentBuildId) return null;
    return results;
}

function makeDiskMesh(year, geometry) {
    const material = new THREE.MeshStandardMaterial({
        color: getYearColor(year),
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { year: year };
    return mesh;
}

function clearCurrentModelMeshes() {
    // Clear old meshes
    for (let item of diskMeshes) {
        scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        if (item.mesh.children) {
            for (let child of item.mesh.children) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
        }
    }
    diskMeshes = [];
    
    if (basePlateMesh) {
        scene.remove(basePlateMesh);
        basePlateMesh.geometry.dispose();
        basePlateMesh = null;
    }
}

async function getGeometrySource(year, anomalies) {
    refreshAuthoritativePreviewCompatibility();
    const authoritativeGeometry = await loadAuthoritativeGeometry(year);
    if (authoritativeGeometry) {
        return { geometry: authoritativeGeometry, authoritative: true };
    }
    return { geometry: buildDiskGeometry(anomalies), authoritative: false };
}

function createBasePlateMesh() {
    const baseGeom = new THREE.CylinderGeometry(state.baseline + 10, state.baseline + 10, 6, 64);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937, // dark slate plastic
        roughness: 0.6,
        metalness: 0.2
    });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.set(0, -3, 0);
    baseMesh.receiveShadow = true;

    // Add a fixed cross plug that matches the disk interlock footprint.
    const pinArmLen = state.hubDiameter / 2.0;
    const pinArmWidth = Math.max(0.1, state.crossThickness || 4.0);
    const pinHeight = Math.min(2.0, Math.max(0.2, state.thickness - 0.65));
    const pinGeom = new THREE.BoxGeometry(pinArmLen * 2.0, pinHeight, pinArmWidth);
    const pinMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.6,
        metalness: 0.2
    });
    const basePinX = new THREE.Mesh(pinGeom, pinMat);
    basePinX.position.set(0, pinHeight / 2.0, 0);
    basePinX.castShadow = true;
    baseMesh.add(basePinX);

    const pinGeomY = new THREE.BoxGeometry(pinArmWidth, pinHeight, pinArmLen * 2.0);
    const basePinY = new THREE.Mesh(pinGeomY, pinMat);
    basePinY.position.set(0, pinHeight / 2.0, 0);
    basePinY.castShadow = true;
    baseMesh.add(basePinY);

    return baseMesh;
}

async function build3DModel() {
    const buildId = ++currentBuildId;
    if (rebuildTimer) {
        clearTimeout(rebuildTimer);
        rebuildTimer = null;
    }
    clearCurrentModelMeshes();
    setModelLoading(true, "Building model...");
    try {
        if (state.mode === 'single') {
            const y = state.activeYear;
            const anomalies = dataset.anomalies[y];
            if (!anomalies) return;

            const src = await getGeometrySource(y, anomalies);
            if (buildId !== currentBuildId) return;

            const material = new THREE.MeshStandardMaterial({
                color: getYearColor(y),
                roughness: 0.5,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(src.geometry, material);
            mesh.position.y = 0;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = { year: y };

            scene.add(mesh);
            diskMeshes.push({ year: y, mesh: mesh });

            controls.target.set(0, state.thickness / 2, 0);

        } else if (state.mode === 'stack') {
            const years = dataset.years.filter(y => y >= state.startYear);
            const count = years.length;
            const towerHeight = count * state.thickness + (count - 1) * state.explode;

            basePlateMesh = createBasePlateMesh();
            scene.add(basePlateMesh);

            controls.target.set(0, towerHeight / 2, 0);

            const loadedYearSet = new Set();
            const onStackItemLoaded = (k, y, src) => {
                if (buildId !== currentBuildId) return;
                if (loadedYearSet.has(y)) return;
                loadedYearSet.add(y);

                const mesh = makeDiskMesh(y, src.geometry);
                const zPos = k * (state.thickness + state.explode);
                mesh.position.set(0, zPos, 0);
                mesh.visible = true;

                scene.add(mesh);
                diskMeshes.push({ year: y, mesh: mesh });
                diskMeshes.sort((a, b) => a.year - b.year);
                updateModelDimensions();
            };

            const loaded = await loadGeometryBatch(years, buildId, "Loading tower disks...", onStackItemLoaded);
            if (!loaded || buildId !== currentBuildId) return;

        } else if (state.mode === 'base') {
            basePlateMesh = createBasePlateMesh();
            scene.add(basePlateMesh);

            controls.target.set(0, 0, 0);

        } else if (state.mode === 'grid') {
            const years = dataset.years.filter(y => y >= state.startYear);
            const count = years.length;
            const cols = Math.ceil(Math.sqrt(count));
            const spacing = state.baseline * 2.2 + state.scale * 2.0;

            const loadedYearSet = new Set();
            const onGridItemLoaded = (k, y, src) => {
                if (buildId !== currentBuildId) return;
                if (loadedYearSet.has(y)) return;
                loadedYearSet.add(y);
                const mesh = makeDiskMesh(y, src.geometry);
                const col = k % cols;
                const row = Math.floor(k / cols);

                const xPos = (col - (cols - 1)/2) * spacing;
                const zPos = (row - (Math.ceil(count / cols) - 1)/2) * spacing;

                mesh.position.set(xPos, 0, zPos);
                mesh.visible = (y <= state.activeYear);

                scene.add(mesh);
                diskMeshes.push({ year: y, mesh: mesh });
                updateModelDimensions();
            };

            const loaded = await loadGeometryBatch(years, buildId, "Loading grid disks...", onGridItemLoaded);
            if (!loaded || buildId !== currentBuildId) return;

            controls.target.set(0, 0, 0);
        }

        updateModelDimensions();
    } finally {
        if (buildId === currentBuildId) {
            setModelLoading(false);
        }
    }
}
