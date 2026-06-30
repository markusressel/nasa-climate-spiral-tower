// 3. Three.js Scene Initialization
function initThreeJS() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0e12);
    
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 5000);
    camera.position.set(100, 120, 150);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.01; // Don't go below floor
    controls.minDistance = 30;
    controls.maxDistance = 1500;
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(100, 150, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    
    const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 0.3); // Accent blue fill light
    dirLight2.position.set(-100, 50, -100);
    scene.add(dirLight2);
    
    const pointLight = new THREE.PointLight(0xffffff, 0.2, 300);
    camera.add(pointLight);
    scene.add(camera);
    
    // Grid Helper / Floor
    const gridHelper = new THREE.GridHelper(300, 50, 0x272d3d, 0x1a1e29);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);
    
    // Window resize handler
    window.addEventListener('resize', onWindowResize);
    
    // Mouse hover detection raycasting
    container.addEventListener('mousemove', onMouseMove);
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function resetCamera() {
    if (!controls || !camera) return;
    
    controls.reset();
    
    if (state.mode === 'single') {
        controls.target.set(0, state.thickness / 2, 0);
        camera.position.set(50, 60, 80);
    } else if (state.mode === 'stack') {
        const count = dataset.years.length;
        const towerHeight = count * state.thickness + (count - 1) * state.explode;
        controls.target.set(0, towerHeight / 2, 0);
        // Position camera back based on tower height to fit it nicely
        camera.position.set(towerHeight * 0.9, towerHeight * 0.8, towerHeight * 1.25);
    } else if (state.mode === 'grid') {
        const count = dataset.years.length;
        const cols = Math.ceil(Math.sqrt(count));
        const spacing = state.baseline * 2.2 + state.scale * 2.0;
        const gridW = cols * spacing;
        
        controls.target.set(0, 0, 0);
        camera.position.set(gridW * 0.7, gridW * 0.8, gridW * 0.95);
    } else if (state.mode === 'base') {
        controls.target.set(0, 0, 0);
        camera.position.set(55, 45, 72);
    }
    
    controls.update();
}
