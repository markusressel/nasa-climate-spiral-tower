// 2. Color System mapping
function lerpColor(color1, color2, factor) {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);
    
    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);
    
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');
    
    return `#${rHex}${gHex}${bHex}`;
}

function getColorForAnomaly(avg) {
    if (state.theme === 'single') {
        return state.filamentColor;
    }
    
    if (state.theme === 'classic') {
        // Blue (cold) -> White (neutral) -> Red (warm)
        if (avg < 0) {
            const factor = Math.min(1.0, avg / dataset.minAvg); // minAvg is negative
            return lerpColor('#f3f4f6', '#1d4ed8', factor); // White to Blue
        } else {
            const factor = Math.min(1.0, avg / dataset.maxAvg);
            return lerpColor('#f3f4f6', '#dc2626', factor); // White to Crimson
        }
    }
    
    if (state.theme === 'thermal') {
        // Multi-point color scale representing the thermal camera palette
        if (avg < -0.2) {
            const factor = Math.min(1.0, (avg + 0.5) / 0.3);
            return lerpColor('#1e3a8a', '#93c5fd', Math.max(0, factor));
        } else if (avg < 0.1) {
            const factor = (avg + 0.2) / 0.3;
            return lerpColor('#93c5fd', '#ffffff', factor);
        } else if (avg < 0.4) {
            const factor = (avg - 0.1) / 0.3;
            return lerpColor('#ffffff', '#eab308', factor);
        } else if (avg < 0.8) {
            const factor = (avg - 0.4) / 0.4;
            return lerpColor('#eab308', '#f97316', factor);
        } else {
            const factor = Math.min(1.0, (avg - 0.8) / 0.4);
            return lerpColor('#f97316', '#dc2626', Math.max(0, factor));
        }
    }
    
    if (state.theme === 'magma') {
        // Purple -> Orange -> Yellow
        const norm = (avg - dataset.minAvg) / (dataset.maxAvg - dataset.minAvg);
        if (norm < 0.3) {
            return lerpColor('#180735', '#57106e', norm / 0.3);
        } else if (norm < 0.7) {
            return lerpColor('#57106e', '#d8454b', (norm - 0.3) / 0.4);
        } else {
            return lerpColor('#d8454b', '#f9e855', (norm - 0.7) / 0.3);
        }
    }
    
    if (state.theme === 'viridis') {
        // Purple -> Green -> Yellow
        const norm = (avg - dataset.minAvg) / (dataset.maxAvg - dataset.minAvg);
        if (norm < 0.4) {
            return lerpColor('#440154', '#31688e', norm / 0.4);
        } else if (norm < 0.7) {
            return lerpColor('#31688e', '#35b779', (norm - 0.4) / 0.3);
        } else {
            return lerpColor('#35b779', '#fde725', (norm - 0.7) / 0.3);
        }
    }
    
    return '#cccccc';
}

function getYearColor(year) {
    const avg = dataset.avgAnomalies[year];
    
    if (state.theme === 'single') {
        return state.filamentColor;
    }
    
    if (state.useCustomPalette) {
        if (state.customColors.length === 0) return '#e2e8f0';
        const N = state.customColors.length;
        const range = dataset.maxAvg - dataset.minAvg;
        if (range <= 0) return state.customColors[0];
        
        const binIndex = Math.min(N - 1, Math.floor(((avg - dataset.minAvg) / range) * N));
        return state.customColors[Math.max(0, binIndex)];
    }
    
    return getColorForAnomaly(avg);
}

function updateColorTheme() {
    const themeSelect = document.getElementById('param-theme');
    if (!themeSelect) return;
    
    themeSelect.value = state.theme;
    
    const filamentGroup = document.getElementById('group-filament-color');
    const paletteControls = document.getElementById('palette-controls');
    
    if (state.theme === 'single') {
        if (filamentGroup) filamentGroup.style.display = 'block';
        if (paletteControls) paletteControls.style.display = 'none';
    } else {
        if (filamentGroup) filamentGroup.style.display = 'none';
        if (paletteControls) paletteControls.style.display = 'block';
    }
    
    // Update legend colors
    const gradientEl = document.getElementById('legend-gradient');
    if (gradientEl) {
        if (state.useCustomPalette) {
            gradientEl.style.background = 'linear-gradient(to right, ' + state.customColors.join(', ') + ')';
        } else {
            if (state.theme === 'classic') {
                gradientEl.style.background = 'linear-gradient(to right, #1d4ed8, #f3f4f6, #dc2626)';
            } else if (state.theme === 'thermal') {
                gradientEl.style.background = 'linear-gradient(to right, #1e3a8a, #93c5fd, #ffffff, #eab308, #f97316, #dc2626)';
            } else if (state.theme === 'magma') {
                gradientEl.style.background = 'linear-gradient(to right, #180735, #57106e, #d8454b, #f9e855)';
            } else if (state.theme === 'viridis') {
                gradientEl.style.background = 'linear-gradient(to right, #440154, #31688e, #35b779, #fde725)';
            } else if (state.theme === 'single') {
                gradientEl.style.background = state.filamentColor;
            }
        }
    }
    
    // Apply colors to existing meshes
    for (let item of diskMeshes) {
        const color = getYearColor(item.year);
        if (item.mesh.material && item.mesh.material.color) {
            item.mesh.material.color.set(color);
        }
    }
    if (window.saveState) {
        window.saveState();
    }
}

function toggleCustomPalette(checked) {
    state.useCustomPalette = checked;
    const controls = document.getElementById('palette-controls');
    if (controls) {
        controls.style.display = checked ? 'block' : 'none';
    }
    
    if (checked && state.customColors.length !== state.paletteSize) {
        autoDetermineColors();
        rebuildPaletteSwatches();
    }
    
    updateColorTheme();
    if (window.saveState) {
        window.saveState();
    }
}

function autoDetermineColors(force = false) {
    if (!force && state.customColors && state.customColors.length === state.paletteSize) {
        return;
    }
    state.customColors = [];
    for (let i = 0; i < state.paletteSize; i++) {
        const factor = state.paletteSize > 1 ? i / (state.paletteSize - 1) : 0.5;
        const avgAnomaly = dataset.minAvg + factor * (dataset.maxAvg - dataset.minAvg);
        state.customColors.push(getColorForAnomaly(avgAnomaly));
    }
}

function rebuildPaletteSwatches() {
    const container = document.getElementById('palette-swatches');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < state.paletteSize; i++) {
        const color = state.customColors[i] || '#e2e8f0';
        
        const swatch = document.createElement('div');
        swatch.className = 'swatch-item';
        
        const factor = state.paletteSize > 1 ? i / (state.paletteSize - 1) : 0.5;
        const val = dataset.minAvg + factor * (dataset.maxAvg - dataset.minAvg);
        const valText = `${val < 0 ? '' : '+'}${val.toFixed(2)}°C`;
        
        swatch.innerHTML = `
            <span class="swatch-label">${valText}</span>
            <div class="swatch-input-wrapper">
                <input type="color" value="${color}" onchange="updatePaletteColor(${i}, this.value)">
            </div>
        `;
        container.appendChild(swatch);
    }
}

function updatePaletteSize(val, source) {
    let size = parseInt(val);
    if (isNaN(size) || size < 1) size = 1;
    if (size > 16) size = 16;
    
    state.paletteSize = size;
    
    // Sync slider and input number box
    if (source === 'slider') {
        const numInput = document.getElementById('val-palette-size-num');
        if (numInput) numInput.value = size;
    } else {
        const sliderInput = document.getElementById('param-palette-size');
        if (sliderInput) sliderInput.value = size;
    }
    
    autoDetermineColors(true);
    rebuildPaletteSwatches();
    updateColorTheme();
}

function updatePaletteColor(index, hexColor) {
    state.customColors[index] = hexColor;
    updateColorTheme();
}

function updateFilamentColor() {
    state.filamentColor = document.getElementById('param-filament-color').value;
    document.getElementById('val-filament-color').innerText = state.filamentColor.toUpperCase();
    updateColorTheme();
}

function applyColorSystem() {
    const themeSelect = document.getElementById('param-theme');
    if (!themeSelect) return;
    const selectedTheme = themeSelect.value;
    
    if (state.useCustomPalette && selectedTheme !== 'single' && state.customColors.length > 0) {
        const shouldRegenerate = window.confirm(
            'Regenerate custom palette from the selected theme? This will overwrite your current swatch edits.'
        );
        if (!shouldRegenerate) return;
    }
    
    state.theme = selectedTheme;
    autoDetermineColors(true);
    rebuildPaletteSwatches();
    updateColorTheme();
}
window.applyColorSystem = applyColorSystem;

