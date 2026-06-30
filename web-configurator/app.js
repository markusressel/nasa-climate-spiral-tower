// NASA Climate Spiral 3D Tower - Web Visualizer
// Bootstrap entrypoint

window.onload = async function() {
    await initDataset();
    initThreeJS();
    setupUIEvents();
    await initAuthoritativePreview();

    // Run the same initialization path as a manual display-mode switch.
    const modeSelect = document.getElementById('param-mode');
    if (modeSelect && modeSelect.value) {
        state.mode = modeSelect.value;
    }
    updateModel();

    animate();

    // Hide instructions overlay on mouse movement over canvas
    const canvasContainer = document.getElementById('canvas-container');
    const hideInstructions = () => {
        const overlay = document.getElementById('instructions');
        if (overlay) {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 600);
        }
        canvasContainer.removeEventListener('mousemove', hideInstructions);
        canvasContainer.removeEventListener('click', hideInstructions);
    };
    canvasContainer.addEventListener('mousemove', hideInstructions);
    canvasContainer.addEventListener('click', hideInstructions);
};
