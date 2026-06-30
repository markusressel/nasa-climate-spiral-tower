function triggerDownload(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function setDownloadButtonBusy(isBusy, label) {
    const btn = document.getElementById('btn-download-stl');
    if (!btn) return;
    if (!btn.dataset.defaultLabel) {
        btn.dataset.defaultLabel = btn.innerHTML;
    }
    btn.disabled = isBusy;
    if (isBusy) {
        btn.innerHTML = `<span class="btn-icon">⏳</span> ${label || 'Preparing...'}`;
    } else {
        btn.innerHTML = btn.dataset.defaultLabel;
    }
}

function getDownloadYearsForCurrentMode() {
    if (state.mode === 'single') {
        return [state.activeYear];
    }
    if (state.mode === 'stack' || state.mode === 'grid') {
        return dataset.years.filter((y) => y >= state.startYear && y <= state.activeYear);
    }
    return dataset.years.slice();
}

function normalizeHexColor(color) {
    if (typeof color !== 'string') return null;
    const hex = color.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    return hex.toUpperCase();
}

function colorWithOpaqueAlpha(color) {
    const hex = normalizeHexColor(color);
    return hex ? `${hex}FF` : '#CCCCCCFF';
}

async function downloadAuthoritative3MFForCurrentMode() {
    const years = getDownloadYearsForCurrentMode();
    if (!years.length) return;
    const yearColors = {};
    for (const year of years) {
        yearColors[String(year)] = normalizeHexColor(getYearColor(year)) || '#CCCCCC';
    }
    const payload = {
        years: years,
        params: canonicalParamsFromState(),
        spacing: state.baseline * 2.6,
        year_colors: yearColors,
        palette_colors: state.useCustomPalette && state.customColors && state.customColors.length > 0 
            ? state.customColors.map(colorWithOpaqueAlpha) 
            : null
    };
    try {
        setDownloadButtonBusy(true, `Preparing 3MF (${years.length} year${years.length === 1 ? '' : 's'})...`);
        const res = await fetch('/api/export/3mf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            throw new Error(`Backend export failed (${res.status})`);
        }
        const data = await res.json();
        if (!data.ok || !data.download_url) {
            throw new Error(data.error || "Backend export response invalid");
        }
        const minYear = years[0];
        const maxYear = years[years.length - 1];
        const filename = `climate_spiral_authoritative_${minYear}_${maxYear}.3mf`;
        const link = document.createElement('a');
        link.href = `${data.download_url}?t=${Date.now()}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error(err);
        alert("Authoritative backend export failed. Falling back to browser export.");
        if (state.mode === 'single') {
            downloadSTL('selected');
        } else if (state.mode === 'stack') {
            downloadSTL('stack');
        } else {
            download3MF(dataset.years);
        }
    } finally {
        setDownloadButtonBusy(false);
    }
}

// CRC32 helper for ZIP generation
function crc32(buf) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[i] = c;
    }
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
}

// Simple Zip writer for uncompressed (Stored) ZIP files
class SimpleZip {
    constructor() {
        this.files = [];
    }
    addFile(name, content) {
        const encoder = new TextEncoder();
        const data = typeof content === 'string' ? encoder.encode(content) : content;
        this.files.push({ name, data });
    }
    generate() {
        const localHeaders = [];
        const centralDirs = [];
        let offset = 0;
        
        for (let file of this.files) {
            const nameBuf = new TextEncoder().encode(file.name);
            const nameLen = nameBuf.length;
            const dataLen = file.data.length;
            const crc = crc32(file.data);
            
            const lh = new Uint8Array(30 + nameLen);
            lh.set([0x50, 0x4b, 0x03, 0x04]); // Signature
            lh.set([10, 0], 4); // Version needed
            lh.set([0, 0], 6); // Flags
            lh.set([0, 0], 8); // Compression (0 = store)
            lh.set([0, 0, 0, 0], 10); // Time/Date
            
            const view = new DataView(lh.buffer);
            view.setUint32(14, crc, true);
            view.setUint32(18, dataLen, true);
            view.setUint32(22, dataLen, true);
            view.setUint16(26, nameLen, true);
            view.setUint16(28, 0, true);
            lh.set(nameBuf, 30);
            
            localHeaders.push({ header: lh, data: file.data, offset: offset });
            offset += lh.length + dataLen;
        }
        
        let cdOffset = offset;
        let cdSize = 0;
        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const nameBuf = new TextEncoder().encode(file.name);
            const nameLen = nameBuf.length;
            const dataLen = file.data.length;
            const crc = crc32(file.data);
            const lhOffset = localHeaders[i].offset;
            
            const cd = new Uint8Array(46 + nameLen);
            cd.set([0x50, 0x4b, 0x01, 0x02]); // Central Directory Header
            cd.set([10, 0], 4);
            cd.set([10, 0], 6);
            cd.set([0, 0], 8);
            cd.set([0, 0], 10);
            cd.set([0, 0, 0, 0], 12);
            
            const view = new DataView(cd.buffer);
            view.setUint32(16, crc, true);
            view.setUint32(20, dataLen, true);
            view.setUint32(24, dataLen, true);
            view.setUint16(28, nameLen, true);
            view.setUint16(30, 0, true);
            view.setUint16(32, 0, true);
            view.setUint16(34, 0, true);
            view.setUint16(36, 0, true);
            view.setUint32(38, 0, true);
            view.setUint32(42, lhOffset, true);
            cd.set(nameBuf, 46);
            
            centralDirs.push(cd);
            cdSize += cd.length;
        }
        
        const eocd = new Uint8Array(22);
        eocd.set([0x50, 0x4b, 0x05, 0x06]);
        const view = new DataView(eocd.buffer);
        view.setUint16(8, this.files.length, true);
        view.setUint16(10, this.files.length, true);
        view.setUint32(12, cdSize, true);
        view.setUint32(16, cdOffset, true);
        
        const totalBuf = new Uint8Array(cdOffset + cdSize + eocd.length);
        let ptr = 0;
        for (let lh of localHeaders) {
            totalBuf.set(lh.header, ptr); ptr += lh.header.length;
            totalBuf.set(lh.data, ptr); ptr += lh.data.length;
        }
        for (let cd of centralDirs) {
            totalBuf.set(cd, ptr); ptr += cd.length;
        }
        totalBuf.set(eocd, ptr);
        return totalBuf;
    }
}

// 12. 3MF Multi-Object Package Exporter (natively groups Disk + Text as a single printable entity per year)
function download3MF(yearsToExport) {
    const steps = 120;
    const crossThickness = Math.max(0.1, state.crossThickness || 4.0);
    const armHalfWidth = crossThickness / 2.0;
    const rPlugArm = state.hubDiameter / 4.0;
    const rSocketArm = rPlugArm + 0.15;
    const wSocketArm = armHalfWidth + 0.15;
    const rHub = state.hubDiameter / 2.0;
    const dRecess = Math.max(0.2, state.thickness - 0.45);
    const plugHeight = Math.min(2.0, Math.max(0.2, dRecess - 0.2));
    const thick = state.thickness;
    
    const numYears = yearsToExport.length;
    const cols = Math.ceil(Math.sqrt(numYears));
    const spacing = state.baseline * 2.2 + state.scale * 2.0;
    
    const modelLines = [];
    modelLines.push('<?xml version="1.0" encoding="UTF-8"?>');
    modelLines.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">');
    modelLines.push('  <metadata name="Application">BambuStudio-02.05.03.61</metadata>');
    modelLines.push('  <resources>');

    const objectColors = yearsToExport.map((year) => colorWithOpaqueAlpha(getYearColor(year)));
    let baseColors = [];
    if (state.useCustomPalette && state.customColors && state.customColors.length > 0) {
        baseColors = state.customColors.map(colorWithOpaqueAlpha);
    } else {
        const seen = new Set();
        for (const col of objectColors) {
            if (!seen.has(col)) {
                seen.add(col);
                baseColors.push(col);
            }
        }
        if (baseColors.length === 0) {
            baseColors.push('#CCCCCCFF');
        }
    }

    modelLines.push('    <basematerials id="1">');
    for (let i = 0; i < baseColors.length; i++) {
        modelLines.push(`      <base name="Filament_${i + 1}" displaycolor="${baseColors[i]}"/>`);
    }
    modelLines.push('    </basematerials>');

    for (let k = 0; k < numYears; k++) {
        const year = yearsToExport[k];
        const anomalies = dataset.anomalies[year];
        const objectId = k + 1;
        const colorHex = objectColors[k];
        let pindex = baseColors.indexOf(colorHex);
        if (pindex === -1) pindex = 0;
        const paintColorCode = (pindex === 0) ? "4" : ((pindex === 1) ? "8" : `${(pindex - 2).toString(16).toUpperCase()}C`);
        
        modelLines.push(`    <object id="${objectId}" name="Disk_${year}" type="model" pid="1" pindex="${pindex}">`);
        modelLines.push('      <mesh>');
        modelLines.push('        <vertices>');
        
        const col = k % cols;
        const row = Math.floor(k / cols);
        const xOffset = (col - (cols - 1)/2) * spacing;
        const yOffset = (row - (Math.ceil(numYears / cols) - 1)/2) * spacing;
        
        const sectorVertices = [];
        for (let j = 0; j < steps; j++) {
            const theta = (j / steps) * (2.0 * Math.PI);
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);
            
            const xh = 0.0;
            const yh = 0.0;

            const ptC = getCrossPoint(theta, rPlugArm, armHalfWidth);
            const ptR = getCrossPoint(theta, rSocketArm, wSocketArm);

            const xHub = rHub * cosT;
            const yHub = rHub * sinT;
            
            const rS = getInterpolatedRadius(anomalies, theta, state.baseline, state.scale, state.hubDiameter);
            const xs = rS * cosT;
            const ys = rS * sinT;
            
            const v0 = [xh + xOffset, yh + yOffset, dRecess];
            const v1 = [xh + xOffset, yh + yOffset, thick + plugHeight];
            const v2 = [ptC.x + xOffset, ptC.y + yOffset, thick + plugHeight];
            const v3 = [ptC.x + xOffset, ptC.y + yOffset, thick];
            const v4 = [xHub + xOffset, yHub + yOffset, thick];
            const v5 = [xs + xOffset, ys + yOffset, thick];
            const v6 = [xs + xOffset, ys + yOffset, 0.0];
            const v7 = [xHub + xOffset, yHub + yOffset, 0.0];
            const v8 = [ptR.x + xOffset, ptR.y + yOffset, 0.0];
            const v9 = [ptR.x + xOffset, ptR.y + yOffset, dRecess];
            
            sectorVertices.push([v0, v1, v2, v3, v4, v5, v6, v7, v8, v9]);
        }
        
        // Write vertices
        for (let j = 0; j < steps; j++) {
            for (let a = 0; a < 10; a++) {
                const v = sectorVertices[j][a];
                modelLines.push(`          <vertex x="${v[0].toFixed(4)}" y="${v[1].toFixed(4)}" z="${v[2].toFixed(4)}"/>`);
            }
        }
        
        modelLines.push('        </vertices>');
        modelLines.push('        <triangles>');
        
        // Write spline triangles
        for (let s = 0; s < steps; s++) {
            const sp1 = (s + 1) % steps;
            
            for (let a = 0; a < 10; a++) {
                const b = (a + 1) % 10;
                
                const idx_a1 = s * 10 + a;
                const idx_b2 = sp1 * 10 + b;
                const idx_a2 = sp1 * 10 + a;
                const idx_b1 = s * 10 + b;
                
                modelLines.push(`          <triangle v1="${idx_a1}" v2="${idx_b2}" v3="${idx_a2}" paint_color="${paintColorCode}"/>`);
                modelLines.push(`          <triangle v1="${idx_a1}" v2="${idx_b1}" v3="${idx_b2}" paint_color="${paintColorCode}"/>`);
            }
        }
        
        modelLines.push('        </triangles>');
        modelLines.push('      </mesh>');
        modelLines.push('    </object>');
    }
    
    modelLines.push('  </resources>');
    modelLines.push('  <build>');
    for (let k = 0; k < numYears; k++) {
        modelLines.push(`    <item objectid="${k + 1}" />`);
    }
    modelLines.push('  </build>');
    modelLines.push('</model>');
    
    const modelXml = modelLines.join('\n');

    const modelSettingsLines = [];
    modelSettingsLines.push('<?xml version="1.0" encoding="UTF-8"?>');
    modelSettingsLines.push('<config>');
    for (let k = 0; k < numYears; k++) {
        const objectId = k + 1;
        const colorHex = objectColors[k];
        let pindex = baseColors.indexOf(colorHex);
        if (pindex === -1) pindex = 0;
        const extruderVal = pindex + 1;
        
        modelSettingsLines.push(`  <object id="${objectId}">`);
        modelSettingsLines.push(`    <metadata key="extruder" value="${extruderVal}"/>`);
        modelSettingsLines.push('  </object>');
    }
    modelSettingsLines.push('</config>');
    const modelSettingsXml = modelSettingsLines.join('\n');
    
    const zip = new SimpleZip();
    zip.addFile('[Content_Types].xml', 
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`);
    
    zip.addFile('_rels/.rels',
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/>
</Relationships>`);
    
    zip.addFile('3D/3dmodel.model', modelXml);
    zip.addFile('Metadata/model_settings.config', modelSettingsXml);
    
    const zipData = zip.generate();
    const blob = new Blob([zipData], { type: 'application/octet-stream' });
    triggerDownload(blob, `climate_spiral_grid_1880_${dataset.maxYear}.3mf`);
}

// 12. Direct Browser Binary STL Exporter
function downloadSTL(modeScope) {
    const steps = 120;
    
    if (modeScope === 'base') {
        const poleSteps = 60;
        const numTriangles = poleSteps * 8; // 4 * poleSteps for base cylinder + 4 * poleSteps for collar pin
        const bufferSize = 80 + 4 + numTriangles * 50;
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        
        for (let i = 0; i < 80; i++) view.setUint8(i, 0);
        view.setUint32(80, numTriangles, true);
        
        let offset = 84;
        const writeTriangle = (normal, v1, v2, v3) => {
            view.setFloat32(offset + 0, normal[0], true);
            view.setFloat32(offset + 4, normal[1], true);
            view.setFloat32(offset + 8, normal[2], true);
            view.setFloat32(offset + 12, v1[0], true);
            view.setFloat32(offset + 16, v1[1], true);
            view.setFloat32(offset + 20, v1[2], true);
            view.setFloat32(offset + 24, v2[0], true);
            view.setFloat32(offset + 28, v2[1], true);
            view.setFloat32(offset + 32, v2[2], true);
            view.setFloat32(offset + 36, v3[0], true);
            view.setFloat32(offset + 40, v3[1], true);
            view.setFloat32(offset + 44, v3[2], true);
            view.setUint16(offset + 48, 0, true);
            offset += 50;
        };
        
        const getNormal = (v1, v2, v3) => {
            const ux = v2[0] - v1[0], uy = v2[1] - v1[1], uz = v2[2] - v1[2];
            const wx = v3[0] - v1[0], wy = v3[1] - v1[1], wz = v3[2] - v1[2];
            const nx = uy * wz - uz * wy;
            const ny = uz * ux - ux * wz;
            const nz = ux * wy - uy * wx;
            const l = Math.sqrt(nx*nx + ny*ny + nz*nz);
            return l > 0 ? [nx/l, ny/l, nz/l] : [0, 0, 0];
        };
        
        const rBase = state.baseline + 10.0;
        const hBase = 6.0;
        
        // 1. Generate Base Plate Mesh (from Z = -6.0 to Z = 0.0)
        const baseVBottom = [];
        const baseVTop = [];
        for (let j = 0; j < poleSteps; j++) {
            const theta = (j / poleSteps) * (2 * Math.PI);
            const bx = rBase * Math.cos(theta);
            const by = rBase * Math.sin(theta);
            baseVBottom.push([bx, by, -hBase]);
            baseVTop.push([bx, by, 0.0]);
        }
        
        for (let j = 0; j < poleSteps; j++) {
            const jp1 = (j + 1) % poleSteps;
            const v_tj = baseVTop[j], v_tjp1 = baseVTop[jp1];
            const v_bj = baseVBottom[j], v_bjp1 = baseVBottom[jp1];
            
            // Bottom Cap
            let tri = [[0, 0, -hBase], v_bjp1, v_bj];
            writeTriangle(getNormal(...tri), ...tri);
            // Top Cap
            tri = [[0, 0, 0.0], v_tj, v_tjp1];
            writeTriangle(getNormal(...tri), ...tri);
            // Wall 1
            tri = [v_tj, v_bjp1, v_tjp1];
            writeTriangle(getNormal(...tri), ...tri);
            // Wall 2
            tri = [v_tj, v_bj, v_bjp1];
            writeTriangle(getNormal(...tri), ...tri);
        }
        
        // 2. Generate central male cross plug (from Z = 0.0 to adaptive height)
        const pinHeight = Math.min(2.0, Math.max(0.2, state.thickness - 0.65));
        const plugArmRadius = state.hubDiameter / 4.0;
        const crossThickness = Math.max(0.1, state.crossThickness || 4.0);
        const armHalfWidth = crossThickness / 2.0;

        const pinVBottom = [];
        const pinVTop = [];
        for (let j = 0; j < poleSteps; j++) {
            const theta = (j / poleSteps) * (2 * Math.PI);
            const pt = getCrossPoint(theta, plugArmRadius, armHalfWidth);
            pinVBottom.push([pt.x, pt.y, 0.0]);
            pinVTop.push([pt.x, pt.y, pinHeight]);
        }
        
        for (let j = 0; j < poleSteps; j++) {
            const jp1 = (j + 1) % poleSteps;
            const v_tj = pinVTop[j], v_tjp1 = pinVTop[jp1];
            const v_bj = pinVBottom[j], v_bjp1 = pinVBottom[jp1];
            
            // Bottom Cap
            let tri = [[0, 0, 0.0], v_bjp1, v_bj];
            writeTriangle(getNormal(...tri), ...tri);
            // Top Cap
            tri = [[0, 0, pinHeight], v_tj, v_tjp1];
            writeTriangle(getNormal(...tri), ...tri);
            // Wall 1
            tri = [v_tj, v_bjp1, v_tjp1];
            writeTriangle(getNormal(...tri), ...tri);
            // Wall 2
            tri = [v_tj, v_bj, v_bjp1];
            writeTriangle(getNormal(...tri), ...tri);
        }
        
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        triggerDownload(blob, `climate_spiral_base.stl`);
        return;
    }
    
    // Disk Exporter Mode
    let yearsToExport = [];
    if (modeScope === 'selected') {
        yearsToExport = [state.activeYear];
    } else if (modeScope === 'stack') {
        yearsToExport = dataset.years.filter((y) => y >= state.startYear && y <= state.activeYear);
    } else {
        yearsToExport = dataset.years;
    }
    

    
    const numTrianglesPerYear = steps * 20; // 10 quad rings * 2 triangles/quad = 20 triangles/step
    const numYears = yearsToExport.length;
    const numTriangles = numTrianglesPerYear * numYears;
    const bufferSize = 80 + 4 + numTriangles * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    
    for (let i = 0; i < 80; i++) view.setUint8(i, 0);
    view.setUint32(80, numTriangles, true);
    
    let offset = 84;
    
    const writeTriangle = (normal, v1, v2, v3) => {
        view.setFloat32(offset + 0, normal[0], true);
        view.setFloat32(offset + 4, normal[1], true);
        view.setFloat32(offset + 8, normal[2], true);
        view.setFloat32(offset + 12, v1[0], true);
        view.setFloat32(offset + 16, v1[1], true);
        view.setFloat32(offset + 20, v1[2], true);
        view.setFloat32(offset + 24, v2[0], true);
        view.setFloat32(offset + 28, v2[1], true);
        view.setFloat32(offset + 32, v2[2], true);
        view.setFloat32(offset + 36, v3[0], true);
        view.setFloat32(offset + 40, v3[1], true);
        view.setFloat32(offset + 44, v3[2], true);
        view.setUint16(offset + 48, 0, true);
        offset += 50;
    };
    
    const getNormal = (v1, v2, v3) => {
        const ux = v2[0] - v1[0], uy = v2[1] - v1[1], uz = v2[2] - v1[2];
        const wx = v3[0] - v1[0], wy = v3[1] - v1[1], wz = v3[2] - v1[2];
        const nx = uy * wz - uz * wy;
        const ny = uz * ux - ux * wz;
        const nz = ux * wy - uy * wx;
        const l = Math.sqrt(nx*nx + ny*ny + nz*nz);
        return l > 0 ? [nx/l, ny/l, nz/l] : [0, 0, 0];
    };
    
    const crossThickness = Math.max(0.1, state.crossThickness || 4.0);
    const armHalfWidth = crossThickness / 2.0;
    const rPlugArm = state.hubDiameter / 4.0;
    const rSocketArm = rPlugArm + 0.15;
    const wSocketArm = armHalfWidth + 0.15;
    const rHub = state.hubDiameter / 2.0;
    const dRecess = Math.max(0.2, state.thickness - 0.45);
    const plugHeight = Math.min(2.0, Math.max(0.2, dRecess - 0.2));
    const thick = state.thickness;
    
    for (let k = 0; k < numYears; k++) {
        const year = yearsToExport[k];
        const anomalies = dataset.anomalies[year];
        
        let xOffset = 0.0;
        let yOffset = 0.0;
        let zOffset = 0.0;

        if (modeScope === 'stack') {
            zOffset = k * (state.thickness + state.explode);
        } else if (modeScope === 'grid') {
            const cols = Math.ceil(Math.sqrt(numYears));
            const spacing = state.baseline * 2.2 + state.scale * 2.0;
            const col = k % cols;
            const row = Math.floor(k / cols);
            xOffset = (col - (cols - 1)/2) * spacing;
            yOffset = (row - (Math.ceil(numYears / cols) - 1)/2) * spacing;
        }
        
        const sectorVertices = [];
        for (let j = 0; j < steps; j++) {
            const theta = (j / steps) * (2.0 * Math.PI);
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);
            
            const xh = 0.0;
            const yh = 0.0;

            const ptC = getCrossPoint(theta, rPlugArm, armHalfWidth);
            const ptR = getCrossPoint(theta, rSocketArm, wSocketArm);

            const xHub = rHub * cosT;
            const yHub = rHub * sinT;
            
            const rS = getInterpolatedRadius(anomalies, theta, state.baseline, state.scale, state.hubDiameter);
            const xs = rS * cosT;
            const ys = rS * sinT;
            
            // Vertices using Z as height coordinate (matching Python STL output)
            const v0 = [xh + xOffset, yh + yOffset, zOffset + dRecess];
            const v1 = [xh + xOffset, yh + yOffset, zOffset + thick + plugHeight];
            const v2 = [ptC.x + xOffset, ptC.y + yOffset, zOffset + thick + plugHeight];
            const v3 = [ptC.x + xOffset, ptC.y + yOffset, zOffset + thick];
            const v4 = [xHub + xOffset, yHub + yOffset, zOffset + thick];
            const v5 = [xs + xOffset, ys + yOffset, zOffset + thick];
            const v6 = [xs + xOffset, ys + yOffset, zOffset];
            const v7 = [xHub + xOffset, yHub + yOffset, zOffset];
            const v8 = [ptR.x + xOffset, ptR.y + yOffset, zOffset];
            const v9 = [ptR.x + xOffset, ptR.y + yOffset, zOffset + dRecess];
            
            sectorVertices.push([v0, v1, v2, v3, v4, v5, v6, v7, v8, v9]);
        }
        
        for (let s = 0; s < steps; s++) {
            const sp1 = (s + 1) % steps;
            const vK = sectorVertices[s];
            const vKp1 = sectorVertices[sp1];
            
            for (let a = 0; a < 10; a++) {
                const b = (a + 1) % 10;
                const a1 = vK[a];
                const b1 = vK[b];
                const a2 = vKp1[a];
                const b2 = vKp1[b];
                
                // Outward normal winding order: a1 -> b2 -> a2 and a1 -> b1 -> b2
                let tri = [a1, b2, a2];
                writeTriangle(getNormal(...tri), ...tri);
                tri = [a1, b1, b2];
                writeTriangle(getNormal(...tri), ...tri);
            }
        }
        
    }
    
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const filename = (modeScope === 'selected') ? `climate_spiral_${state.activeYear}.stl` : `climate_spiral_tower_1880_${dataset.maxYear}.stl`;
    triggerDownload(blob, filename);
}
