// NASA Climate Spiral 3D Tower - Web Visualizer
// Author: Antigravity

// Scene State Variables
let scene, camera, renderer, controls;
let diskMeshes = [];
let basePlateMesh = null;
let hoveredMesh = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Configuration state matching UI defaults
const state = {
    mode: 'stack', // stack, single, grid
    startYear: 1880,
    activeYear: 2024,
    explode: 0.0,
    theme: 'classic',
    filamentColor: '#e2e8f0',
    
    // CAD Dimensions (mm)
    hubDiameter: 18.0,
    thickness: 2.0,
    baseline: 30.0,
    scale: 16.5,
    armWidth: 4.0,
    crossThickness: 2.0,

    // Label settings (authoritative backend)
    labelTextDepth: 1.2,
    labelFont: 'Liberation Sans:style=Bold',
    labelSize: 4.0,

    // Custom Palette
    useCustomPalette: true,
    paletteSize: 4,
    customColors: [],
    
    // Animation
    isPlaying: false,
    playInterval: null,
    
    // Backend-authoritative preview
    authoritativePreviewEnabled: false,
    backendApiEnabled: false
};

// ----------------------------------------------------
// LOCAL STORAGE PERSISTENCE
// ----------------------------------------------------
function saveStateToLocalStorage() {
    const keysToPersist = [
        'mode', 'startYear', 'activeYear', 'explode', 'theme', 'filamentColor',
        'hubDiameter', 'thickness', 'baseline', 'scale', 'armWidth', 'crossThickness',
        'labelTextDepth', 'labelFont', 'labelSize', 'useCustomPalette', 'paletteSize', 'customColors'
    ];
    const data = {};
    for (const key of keysToPersist) {
        data[key] = state[key];
    }
    localStorage.setItem('climate_spiral_tower_config', JSON.stringify(data));
}
window.saveStateToLocalStorage = saveStateToLocalStorage;

function loadStateFromLocalStorage() {
    try {
        const raw = localStorage.getItem('climate_spiral_tower_config');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data) return;
        
        const keysToPersist = [
            'mode', 'startYear', 'activeYear', 'explode', 'theme', 'filamentColor',
            'hubDiameter', 'thickness', 'baseline', 'scale', 'armWidth', 'crossThickness',
            'labelTextDepth', 'labelFont', 'labelSize', 'useCustomPalette', 'paletteSize', 'customColors'
        ];
        
        for (const key of keysToPersist) {
            if (data[key] !== undefined) {
                state[key] = data[key];
            }
        }
    } catch (err) {
        console.warn("Failed to load state from localStorage:", err);
    }
}
window.loadStateFromLocalStorage = loadStateFromLocalStorage;

// Load immediately on script parse
loadStateFromLocalStorage();

function saveState() {
    saveStateToLocalStorage();
}
window.saveState = saveState;

const DEFAULTS = {
    mode: 'stack',
    startYear: 1880,
    activeYear: 2024,
    explode: 0.0,
    theme: 'classic',
    filamentColor: '#e2e8f0',
    hubDiameter: 18.0,
    thickness: 2.0,
    baseline: 30.0,
    scale: 16.5,
    armWidth: 4.0,
    crossThickness: 2.0,
    labelTextDepth: 1.2,
    labelFont: 'Liberation Sans:style=Bold',
    labelSize: 4.0,
    useCustomPalette: true,
    paletteSize: 4,
    customColors: []
};
window.DEFAULTS = DEFAULTS;

function resetParam(key) {
    if (key === 'startYear') {
        state.startYear = (typeof dataset !== 'undefined' && dataset) ? dataset.minYear : DEFAULTS.startYear;
    } else if (key === 'activeYear') {
        state.activeYear = (typeof dataset !== 'undefined' && dataset) ? dataset.maxYear : DEFAULTS.activeYear;
    } else if (key === 'customColors') {
        state.paletteSize = DEFAULTS.paletteSize;
        state.customColors = [];
        if (window.autoDetermineColors) window.autoDetermineColors(true);
        if (window.rebuildPaletteSwatches) window.rebuildPaletteSwatches();
    } else {
        if (DEFAULTS[key] !== undefined) {
            state[key] = DEFAULTS[key];
        }
    }
    
    // Sync the UI controls & trigger callbacks programmatically via events
    if (window.syncUIFromState) {
        window.syncUIFromState(true);
    }

    if (key === 'theme' || key === 'filamentColor' || key === 'customColors') {
        if (window.updateColorTheme) window.updateColorTheme();
    }
    
    saveStateToLocalStorage();
}
window.resetParam = resetParam;

function resetAllConfigurationOptions() {
    localStorage.removeItem('climate_spiral_tower_config');
    window.location.reload();
}
window.resetAllConfigurationOptions = resetAllConfigurationOptions;

// Global statistics parsed from climate_data.js
let dataset = {
    years: [],
    anomalies: {},
    avgAnomalies: {},
    minYear: 1880,
    maxYear: 2025,
    minAvg: 0,
    maxAvg: 0
};
