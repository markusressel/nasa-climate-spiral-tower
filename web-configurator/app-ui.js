// 6. UI Events & Interactive Updates
function getMaxLabelDepthForThickness(thickness) {
    // Keep a small safety margin so depth is always strictly less than thickness.
    return Math.max(0.2, thickness - 0.1);
}

function enforceLabelDepthConstraint() {
    const depthSlider = document.getElementById('param-label-depth');
    const depthValueEl = document.getElementById('val-label-depth-num');
    const maxDepth = getMaxLabelDepthForThickness(state.thickness);

    if (depthSlider) {
        depthSlider.max = maxDepth.toFixed(1);
    }
    if (state.labelTextDepth > maxDepth) {
        state.labelTextDepth = maxDepth;
    }
    if (depthSlider) {
        depthSlider.value = state.labelTextDepth.toFixed(1);
    }
    if (depthValueEl) {
        depthValueEl.value = state.labelTextDepth.toFixed(1);
    }
}

function syncUIFromState(triggerEvents = false) {
    const updateEl = (id, val, eventName = 'change') => {
        const el = document.getElementById(id);
        if (el) {
            el.value = val;
            if (triggerEvents) {
                el.dispatchEvent(new Event(eventName));
            }
        }
    };
    
    updateEl('param-mode', state.mode, 'change');
    updateEl('param-explode', state.explode, 'input');
    updateEl('param-hub-diameter', state.hubDiameter, 'input');
    updateEl('param-thickness', state.thickness, 'input');
    updateEl('param-arm-width', state.armWidth, 'input');
    updateEl('param-cross-thickness', state.crossThickness, 'input');
    updateEl('param-baseline', state.baseline, 'input');
    updateEl('param-scale', state.scale, 'input');
    updateEl('param-label-size', state.labelSize, 'input');
    updateEl('param-label-depth', state.labelTextDepth, 'input');
    updateEl('param-label-font', state.labelFont, 'change');
    updateEl('param-theme', state.theme, 'change');
    updateEl('param-filament-color', state.filamentColor, 'change');
    updateEl('param-palette-size', state.paletteSize, 'input');
    updateEl('param-start-year', state.startYear, 'input');
    updateEl('param-active-year', state.activeYear, 'input');
}
window.syncUIFromState = syncUIFromState;

function setupUIEvents() {
    syncUIFromState();
    // Connect sliders to inputs
    setupSlider('param-start-year', 'val-start-year-num', (val) => {
        updateStartYear(val);
    });

    setupSlider('param-active-year', 'val-active-year-num', (val) => {
        updateActiveYear(val);
    });
    
    setupSlider('param-explode', 'val-explode-num', (val) => {
        state.explode = parseFloat(val);
        if (state.mode === 'stack') {
            const count = diskMeshes.length;
            for (let k = 0; k < count; k++) {
                const zPos = k * (state.thickness + state.explode);
                diskMeshes[k].mesh.position.y = zPos;
            }
        }
    });
    
    // CAD sliders
    setupSlider('param-hub-diameter', 'val-hub-diameter-num', (val) => {
        state.hubDiameter = parseFloat(val);
        scheduleModelRebuild();
    });
    
    setupSlider('param-thickness', 'val-thickness-num', (val) => {
        state.thickness = parseFloat(val);
        enforceLabelDepthConstraint();
        scheduleModelRebuild();
    });

    setupSlider('param-arm-width', 'val-arm-width-num', (val) => {
        state.armWidth = parseFloat(val);
        scheduleModelRebuild();
    });

    setupSlider('param-cross-thickness', 'val-cross-thickness-num', (val) => {
        state.crossThickness = parseFloat(val);
        scheduleModelRebuild();
    });

    setupSlider('param-baseline', 'val-baseline-num', (val) => {
        state.baseline = parseFloat(val);
        scheduleModelRebuild();
    });
    
    setupSlider('param-scale', 'val-scale-num', (val) => {
        state.scale = parseFloat(val);
        scheduleModelRebuild();
    });

    setupSlider('param-label-size', 'val-label-size-num', (val) => {
        state.labelSize = parseFloat(val);
        scheduleModelRebuild();
    });

    setupSlider('param-label-depth', 'val-label-depth-num', (val) => {
        const maxDepth = getMaxLabelDepthForThickness(state.thickness);
        state.labelTextDepth = Math.min(parseFloat(val), maxDepth);
        enforceLabelDepthConstraint();
        scheduleModelRebuild();
    });

    const labelFontSelect = document.getElementById('param-label-font');
    if (labelFontSelect) {
        labelFontSelect.value = state.labelFont;
        labelFontSelect.addEventListener('change', (e) => {
            state.labelFont = e.target.value;
            scheduleModelRebuild();
        });
    }

    const scrubberContainer = document.querySelector('.vertical-slider-track-container');
    if (scrubberContainer) {
        scrubberContainer.addEventListener('mousemove', (e) => {
            const rect = scrubberContainer.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;
            const pct = 1.0 - (mouseY / rect.height);
            
            const min = (typeof dataset !== 'undefined' && dataset) ? dataset.minYear : 1880;
            const max = (typeof dataset !== 'undefined' && dataset) ? dataset.maxYear : 2025;
            const mouseVal = min + pct * (max - min);
            
            const startVal = state.startYear;
            const endVal = state.activeYear;
            
            const distToStart = Math.abs(mouseVal - startVal);
            const distToEnd = Math.abs(mouseVal - endVal);
            
            const startSlider = document.getElementById('height-start-slider');
            const endSlider = document.getElementById('height-slider');
            if (startSlider && endSlider) {
                if (distToStart < distToEnd) {
                    startSlider.style.zIndex = 5;
                    endSlider.style.zIndex = 4;
                } else {
                    endSlider.style.zIndex = 5;
                    startSlider.style.zIndex = 4;
                }
            }
        });
    }

    const horizontalContainer = document.querySelector('.horizontal-slider-track-container');
    if (horizontalContainer) {
        horizontalContainer.addEventListener('mousemove', (e) => {
            const rect = horizontalContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const pct = mouseX / rect.width;
            
            const min = (typeof dataset !== 'undefined' && dataset) ? dataset.minYear : 1880;
            const max = (typeof dataset !== 'undefined' && dataset) ? dataset.maxYear : 2025;
            const mouseVal = min + pct * (max - min);
            
            const startVal = state.startYear;
            const endVal = state.activeYear;
            
            const distToStart = Math.abs(mouseVal - startVal);
            const distToEnd = Math.abs(mouseVal - endVal);
            
            const startSlider = document.getElementById('param-start-year');
            const endSlider = document.getElementById('param-active-year');
            if (startSlider && endSlider) {
                if (distToStart < distToEnd) {
                    startSlider.style.zIndex = 5;
                    endSlider.style.zIndex = 4;
                } else {
                    endSlider.style.zIndex = 5;
                    startSlider.style.zIndex = 4;
                }
            }
        });
    }

    enforceLabelDepthConstraint();
}

function getDecimalPlaces(stepStr) {
    if (!stepStr) return 0;
    const parts = stepStr.split('.');
    return parts.length > 1 ? parts[1].length : 0;
}

function setupSlider(id, inputId, callback) {
    const slider = document.getElementById(id);
    const input = document.getElementById(inputId);
    if (!slider || !input) return;
    
    const step = slider.getAttribute('step') || '1';
    const decimals = getDecimalPlaces(step);
    
    const formatVal = (val) => {
        const num = parseFloat(val);
        return isNaN(num) ? val : num.toFixed(decimals);
    };

    // Initialize formatted value
    input.value = formatVal(slider.value);
    
    slider.addEventListener('input', function(e) {
        input.value = formatVal(e.target.value);
        callback(e.target.value);
    });
    
    slider.addEventListener('change', function() {
        if (window.saveState) window.saveState();
    });
    
    input.addEventListener('change', function(e) {
        let val = parseFloat(e.target.value);
        if (isNaN(val)) {
            input.value = formatVal(slider.value);
            return;
        }
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        if (val < min) val = min;
        if (val > max) val = max;
        
        input.value = formatVal(val);
        slider.value = val;
        callback(val);
        if (window.saveState) window.saveState();
    });

    input.addEventListener('input', function(e) {
        let val = parseFloat(e.target.value);
        if (isNaN(val)) return;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        if (val >= min && val <= max) {
            slider.value = val;
            callback(val);
        }
    });
}

function updateStartYear(val) {
    let year = parseInt(val);
    if (year > state.activeYear) {
        year = state.activeYear;
    }
    state.startYear = year;
    
    const startInput = document.getElementById('val-start-year-num');
    if (startInput) startInput.value = year;
    const startSlider = document.getElementById('param-start-year');
    if (startSlider) startSlider.value = year;
    const heightStartSlider = document.getElementById('height-start-slider');
    if (heightStartSlider) heightStartSlider.value = year;
    
    if (state.mode === 'single') {
        scheduleModelRebuild(80);
    } else if (state.mode === 'stack' || state.mode === 'grid') {
        scheduleModelRebuild(80);
    }
    
    updateVerticalTrackHighlight();
    if (window.updateHorizontalTrackHighlight) {
        window.updateHorizontalTrackHighlight();
    }
    updateDownloadButtonText();
    updateModelDimensions();
}

function updateActiveYear(val) {
    let year = parseInt(val);
    if (year < state.startYear) {
        year = state.startYear;
    }
    state.activeYear = year;
    
    const valEl = document.getElementById('val-active-year-num');
    if (valEl) valEl.value = year;
    
    // Sync horizontal slider
    const horSlider = document.getElementById('param-active-year');
    if (horSlider) horSlider.value = year;
    
    // Sync vertical height slider
    const heightSlider = document.getElementById('height-slider');
    if (heightSlider) heightSlider.value = year;
    
    if (state.mode === 'single') {
        scheduleModelRebuild(80);
    } else if (state.mode === 'stack' || state.mode === 'grid') {
        for (let item of diskMeshes) {
            item.mesh.visible = (item.year >= state.startYear && item.year <= state.activeYear);
        }
    }
    
    updateVerticalTrackHighlight();
    if (window.updateHorizontalTrackHighlight) {
        window.updateHorizontalTrackHighlight();
    }
    showYearDetails(state.activeYear);
    updateDownloadButtonText();
    updateModelDimensions();
}

function updateHeightScrubber(val) {
    if (state.isPlaying) {
        togglePlay(); // Pause if playing
    }
    updateActiveYear(val);
}

function updateHeightStartScrubber(val) {
    if (state.isPlaying) {
        togglePlay(); // Pause if playing
    }
    updateStartYear(val);
}

function updateVerticalTrackHighlight() {
    const min = (typeof dataset !== 'undefined' && dataset) ? dataset.minYear : 1880;
    const max = (typeof dataset !== 'undefined' && dataset) ? dataset.maxYear : 2025;
    const startVal = state.startYear;
    const endVal = state.activeYear;
    
    const startPct = ((startVal - min) / (max - min)) * 100;
    const endPct = ((endVal - min) / (max - min)) * 100;
    
    const highlight = document.getElementById('vertical-slider-track-highlight');
    if (highlight) {
        highlight.style.bottom = `${startPct}%`;
        highlight.style.height = `${endPct - startPct}%`;
    }
}
window.updateVerticalTrackHighlight = updateVerticalTrackHighlight;

function updatePlaySpeed(val) {
    if (state.isPlaying) {
        clearInterval(state.playInterval);
        state.isPlaying = false;
        togglePlay(); // restart with new speed
    }
}

function updateExplode(val) {
    // Handled in setupSlider
}

function updateCADParam(param, val) {
    // Handled in setupSlider
}

function updateModel() {
    state.mode = document.getElementById('param-mode').value;
    
    const yearRangeGroup = document.getElementById('group-year-range');
    const labelYearRange = document.getElementById('label-year-range');
    const explodeGroup = document.getElementById('group-explode');
    const animControls = document.getElementById('overlay-anim-controls');
    
    if (state.mode === 'single') {
        if (yearRangeGroup) {
            yearRangeGroup.style.display = 'block';
            yearRangeGroup.classList.add('single-mode-active');
        }
        if (labelYearRange) labelYearRange.innerText = 'Active Year';
        if (explodeGroup) explodeGroup.style.display = 'none';
        if (animControls) animControls.style.display = 'flex';
    } else if (state.mode === 'base') {
        if (yearRangeGroup) yearRangeGroup.style.display = 'none';
        if (explodeGroup) explodeGroup.style.display = 'none';
        if (animControls) animControls.style.display = 'none';
        if (state.isPlaying) togglePlay(); // Pause if playing
    } else if (state.mode === 'stack' || state.mode === 'grid') {
        if (yearRangeGroup) {
            yearRangeGroup.style.display = 'block';
            yearRangeGroup.classList.remove('single-mode-active');
        }
        if (labelYearRange) labelYearRange.innerText = 'Year Range';
        if (explodeGroup) explodeGroup.style.display = 'block';
        if (animControls) animControls.style.display = 'flex';
    }
    
    scheduleModelRebuild(0);
    resetCamera();
    updateDownloadButtonText();
    if (window.saveState) window.saveState();
}

function updateDownloadButtonText() {
    const btn = document.getElementById('btn-download-stl');
    if (!btn) return;
    
    const useBackend3mf = state.backendApiEnabled && state.mode !== 'base';
    if (state.mode === 'single') {
        btn.innerHTML = useBackend3mf
            ? `<span class="btn-icon">💾</span> 3MF (Disk ${state.activeYear})`
            : `<span class="btn-icon">💾</span> STL (Disk ${state.activeYear})`;
    } else if (state.mode === 'stack') {
        btn.innerHTML = useBackend3mf
            ? `<span class="btn-icon">💾</span> 3MF (Visible Years)`
            : `<span class="btn-icon">💾</span> STL (Full Stack)`;
    } else if (state.mode === 'grid') {
        btn.innerHTML = `<span class="btn-icon">💾</span> 3MF (Grid Tray)`;
    } else if (state.mode === 'base') {
        btn.innerHTML = `<span class="btn-icon">💾</span> STL (Base Plate)`;
    }
    if (!btn.disabled) {
        btn.dataset.defaultLabel = btn.innerHTML;
    }
}

async function triggerContextDownload() {
    const btn = document.getElementById('btn-download-stl');
    if (btn && btn.disabled) return;
    if (state.backendApiEnabled && state.mode !== 'base') {
        await downloadAuthoritative3MFForCurrentMode();
        return;
    }
    if (state.mode === 'single') {
        downloadSTL('selected');
    } else if (state.mode === 'stack') {
        downloadSTL('stack');
    } else if (state.mode === 'grid') {
        download3MF(dataset.years.filter(y => y >= state.startYear && y <= state.activeYear));
    } else if (state.mode === 'base') {
        downloadSTL('base');
    }
}

function updateModelDimensions() {
    const meshes = [];
    for (let item of diskMeshes) {
        if (item.mesh.visible) meshes.push(item.mesh);
    }
    if (basePlateMesh && basePlateMesh.visible) meshes.push(basePlateMesh);
    
    const displayEl = document.getElementById('dimensions-display');
    if (!displayEl) return;
    
    if (meshes.length === 0) {
        displayEl.innerHTML = "Model Size: <span style='color: var(--accent);'>0.0</span> × <span style='color: var(--accent);'>0.0</span> × <span style='color: var(--accent);'>0.0</span> mm";
        return;
    }
    
    const box = new THREE.Box3();
    box.makeEmpty();
    for (let m of meshes) {
        box.expandByObject(m);
    }
    
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // In our WebGL coordinate system:
    // X is width, Z is depth (on the horizontal plane), Y is vertical height!
    const w = size.x.toFixed(1);
    const d = size.z.toFixed(1);
    const h = size.y.toFixed(1);
    
    displayEl.innerHTML = `Model Size: <span style="color: var(--accent); font-weight: 700;">${w}</span> × <span style="color: var(--accent); font-weight: 700;">${d}</span> × <span style="color: var(--accent); font-weight: 700;">${h}</span> mm`;
}

// 7. Navigation Tabs
function switchTab(tabId) {
    const buttons = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    buttons.forEach(btn => btn.classList.remove('active'));
    panes.forEach(pane => pane.classList.remove('active'));
    
    // Find active tab index and highlight button
    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// 8. Animation & Stacking Timelapse
function togglePlay() {
    const playBtn = document.getElementById('btn-play-overlay');
    if (state.isPlaying) {
        state.isPlaying = false;
        clearInterval(state.playInterval);
        if (playBtn) {
            playBtn.innerHTML = '<span class="btn-icon">▶</span> Play Timelapse';
            playBtn.classList.remove('btn-primary');
        }
    } else {
        state.isPlaying = true;
        if (playBtn) {
            playBtn.innerHTML = '<span class="btn-icon">❚❚</span> Pause';
            playBtn.classList.add('btn-primary');
        }
        
        const speedSlider = document.getElementById('param-speed-overlay');
        const intervalMs = speedSlider ? parseInt(speedSlider.value) : 60;
        
        if (state.mode !== 'single') {
            // Stack mode building animation: hide all meshes, show one by one!
            const visibleDisks = diskMeshes.filter(item => item.year >= state.startYear && item.year <= dataset.maxYear);
            let currentK = 0;
            const count = visibleDisks.length;
            
            // Set all meshes invisible
            for (let item of diskMeshes) item.mesh.visible = false;

            state.playInterval = setInterval(() => {
                if (currentK < count) {
                    const activeY = visibleDisks[currentK].year;
                    state.activeYear = activeY;
                    visibleDisks[currentK].mesh.visible = true;
                    showYearDetails(activeY);
                    
                    // Sync sliders
                    const heightSlider = document.getElementById('height-slider');
                    if (heightSlider) heightSlider.value = activeY;
                    const horSlider = document.getElementById('param-active-year');
                    if (horSlider) horSlider.value = activeY;
                    const valEl = document.getElementById('val-active-year-num');
                    if (valEl) valEl.value = activeY;
                    
                    // Pan camera with the building stack
                    const zPos = currentK * (state.thickness + state.explode);
                    controls.target.y = zPos;
                    
                    currentK++;
                } else {
                    // Finished
                    togglePlay();
                }
            }, intervalMs);
        } else {
            // Single year slider transition
            let currentYear = state.activeYear;
            if (currentYear >= dataset.maxYear) currentYear = dataset.minYear - 1;
            
            state.playInterval = setInterval(() => {
                currentYear++;
                if (currentYear > dataset.maxYear) {
                    currentYear = dataset.minYear;
                }
                
                state.activeYear = currentYear;
                
                // Sync sliders
                const heightSlider = document.getElementById('height-slider');
                if (heightSlider) heightSlider.value = currentYear;
                const horSlider = document.getElementById('param-active-year');
                if (horSlider) horSlider.value = currentYear;
                const valEl = document.getElementById('val-active-year-num');
                if (valEl) valEl.value = currentYear;
                
                scheduleModelRebuild(0);
                showYearDetails(currentYear);
            }, intervalMs * 4); // Single disk rotations are naturally slower
        }
    }
}

// 9. Hover Tooltips & Raycasting
function onMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function updateRaycasting() {
    raycaster.setFromCamera(mouse, camera);
    const meshesToIntersect = diskMeshes.map(d => d.mesh);
    const intersects = raycaster.intersectObjects(meshesToIntersect);
    
    const tooltip = document.getElementById('canvas-tooltip');
    
    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        
        if (hoveredMesh !== hitMesh) {
            // Reset old hovered
            if (hoveredMesh) {
                hoveredMesh.material.emissive.setHex(0x000000);
            }
            // Set new hovered
            hoveredMesh = hitMesh;
            hoveredMesh.material.emissive.setHex(0x222222);
            
            const year = hoveredMesh.userData.year;
            showYearDetails(year);
        }
        
        // Show overlay tooltip near mouse
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        
        // Calculate screen space position
        const vector = intersects[0].point.clone().project(camera);
        const x = (vector.x *  .5 + .5) * rect.width;
        const y = (vector.y * -.5 + .5) * rect.height;
        
        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y - 30}px`;
        tooltip.style.display = 'block';
        tooltip.innerText = hoveredMesh.userData.year;
    } else {
        if (hoveredMesh) {
            hoveredMesh.material.emissive.setHex(0x000000);
            hoveredMesh = null;
        }
        tooltip.style.display = 'none';
    }
}

function showYearDetails(year) {
    const card = document.getElementById('details-card');
    const yearEl = document.getElementById('card-year');
    const anomalyEl = document.getElementById('card-anomaly');
    const svg = document.getElementById('chart-svg');
    
    const anomalies = dataset.anomalies[year];
    const avg = dataset.avgAnomalies[year];
    
    if (!anomalies) return;
    
    card.classList.add('visible');
    yearEl.innerText = year;
    anomalyEl.innerText = `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}°C`;
    
    // Set color class
    anomalyEl.className = 'card-anomaly ' + (avg < -0.15 ? 'cold' : (avg > 0.15 ? 'warm' : 'neutral'));
    
    // Render Mini SVG Line Chart
    svg.innerHTML = '';
    const width = svg.clientWidth || 280;
    const height = 110;
    
    // Max absolute anomaly for plotting range (usually ~1.6°C)
    const yMax = 1.6;
    const yMin = -0.8;
    
    // Map anomaly value to SVG Y pixel coordinate
    const valToY = (val) => {
        const norm = (val - yMin) / (yMax - yMin);
        return height - (norm * height);
    };
    
    // Map month index (0 to 11) to X pixel coordinate
    const idxToX = (idx) => {
        return (idx / 11) * (width - 20) + 10;
    };
    
    // Baseline 0°C line
    const zeroY = valToY(0);
    const zeroLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    zeroLine.setAttribute('x1', '0');
    zeroLine.setAttribute('y1', zeroY);
    zeroLine.setAttribute('x2', width);
    zeroLine.setAttribute('y2', zeroY);
    zeroLine.setAttribute('stroke', 'rgba(255,255,255,0.15)');
    zeroLine.setAttribute('stroke-dasharray', '2,2');
    svg.appendChild(zeroLine);
    
    // Draw the monthly values line path
    let pathD = '';
    for (let m = 0; m < 12; m++) {
        const x = idxToX(m);
        const y = valToY(anomalies[m]);
        if (m === 0) pathD += `M ${x} ${y}`;
        else pathD += ` L ${x} ${y}`;
    }
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', avg < 0 ? '#3b82f6' : '#ef4444');
    path.setAttribute('stroke-width', '2.5');
    svg.appendChild(path);
    
    // Add dots for each month
    for (let m = 0; m < 12; m++) {
        const cx = idxToX(m);
        const cy = valToY(anomalies[m]);
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', '3.5');
        circle.setAttribute('fill', anomalies[m] < 0 ? '#60a5fa' : '#f87171');
        circle.setAttribute('stroke', '#0d0e12');
        circle.setAttribute('stroke-width', '1');
        
        // Add dynamic tooltip/title on hover
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        title.textContent = `${monthsNames[m]}: ${anomalies[m] >= 0 ? '+' : ''}${anomalies[m]}°C`;
        circle.appendChild(title);
        
        svg.appendChild(circle);
    }
}

// 10. Main Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateRaycasting();
    renderer.render(scene, camera);
}
