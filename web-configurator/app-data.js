// 1. Data Processing
async function initDataset() {
    let payload = null;
    try {
        const res = await fetch('/api/dataset', { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`Dataset endpoint failed (${res.status})`);
        }
        payload = await res.json();
        if (!payload.ok || !Array.isArray(payload.years) || !payload.monthly_anomalies) {
            throw new Error("Dataset payload invalid");
        }
    } catch (err) {
        console.error("Backend dataset unavailable:", err);
        throw err;
    }
    
    dataset.years = payload.years;
    dataset.anomalies = payload.monthly_anomalies;
    
    dataset.minYear = dataset.years[0];
    dataset.maxYear = dataset.years[dataset.years.length - 1];
    
    // Calculate averages and bounds
    let first = true;
    for (let y of dataset.years) {
        const months = dataset.anomalies[y];
        const avg = months.reduce((a, b) => a + b, 0) / 12;
        dataset.avgAnomalies[y] = avg;
        
        if (first) {
            dataset.minAvg = avg;
            dataset.maxAvg = avg;
            first = false;
        } else {
            if (avg < dataset.minAvg) dataset.minAvg = avg;
            if (avg > dataset.maxAvg) dataset.maxAvg = avg;
        }
    }
    
    // Update labels in UI
    document.getElementById('info-coverage').innerText = `${dataset.minYear} - ${dataset.maxYear}`;
    document.getElementById('info-total-years').innerText = dataset.years.length;
    
    document.getElementById('param-active-year').min = dataset.minYear;
    document.getElementById('param-active-year').max = dataset.maxYear;
    if (!state.activeYear || state.activeYear < dataset.minYear || state.activeYear > dataset.maxYear) {
        state.activeYear = dataset.maxYear;
    }
    document.getElementById('param-active-year').value = state.activeYear;
    document.getElementById('val-active-year-num').value = state.activeYear;

    if (!state.startYear || state.startYear < dataset.minYear || state.startYear > dataset.maxYear) {
        state.startYear = dataset.minYear;
    }
    const startYearSlider = document.getElementById('param-start-year');
    if (startYearSlider) {
        startYearSlider.min = dataset.minYear;
        startYearSlider.max = dataset.maxYear;
        startYearSlider.value = state.startYear;
    }
    const startYearInput = document.getElementById('val-start-year-num');
    if (startYearInput) {
        startYearInput.min = dataset.minYear;
        startYearInput.max = dataset.maxYear;
        startYearInput.value = state.startYear;
    }
    
    // Update vertical height scrubber bounds
    const scrMin = document.getElementById('scrubber-min-label');
    const scrMax = document.getElementById('scrubber-max-label');
    if (scrMin) scrMin.innerText = dataset.minYear;
    if (scrMax) scrMax.innerText = dataset.maxYear;
    const heightSlider = document.getElementById('height-slider');
    if (heightSlider) {
        heightSlider.min = dataset.minYear;
        heightSlider.max = dataset.maxYear;
        heightSlider.value = state.activeYear;
    }
    const heightStartSlider = document.getElementById('height-start-slider');
    if (heightStartSlider) {
        heightStartSlider.min = dataset.minYear;
        heightStartSlider.max = dataset.maxYear;
        heightStartSlider.value = state.startYear;
    }
    
    if (window.updateVerticalTrackHighlight) {
        window.updateVerticalTrackHighlight();
    }
    if (window.updateHorizontalTrackHighlight) {
        window.updateHorizontalTrackHighlight();
    }
    
    // Update legend values
    document.getElementById('legend-min').innerText = `${dataset.minAvg < 0 ? '' : '+'}${dataset.minAvg.toFixed(2)}°C`;
    document.getElementById('legend-max').innerText = `+${dataset.maxAvg.toFixed(2)}°C`;
    
    // Initialize custom palette
    autoDetermineColors();
    rebuildPaletteSwatches();
    updateColorTheme();

    updateDownloadButtonText();
}
