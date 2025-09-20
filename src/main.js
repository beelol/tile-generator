import { Delaunay } from "https://cdn.jsdelivr.net/npm/d3-delaunay@6/+esm";
import { createNoise3D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm";

const canvas = document.getElementById("voronoi-canvas");
const ctx = canvas.getContext("2d");
const noiseCanvas = document.getElementById("noise-canvas");
const noiseCtx = noiseCanvas.getContext("2d");
const addTileBtn = document.getElementById("add-tile");
const toggleElevationBtn = document.getElementById("toggle-elevation");
const toggleNoiseBtn = document.getElementById("toggle-noise");
const exportBtn = document.getElementById("export-json");

const BALLOON_SCALE = 160;
const CIRCLE_RADIUS = 14;
const HANDLE_RADIUS = 10;
const LABEL_OFFSET = 20;

let centers = [];
let voronoi = null;
let selectedId = null;
let dragging = null;
let elevationOnly = false;
let noiseVisible = false;
let hueCycle = 0;
let noiseGenerator = createNoise3D();

function randomHue() {
  hueCycle += 137.508; // golden ratio increment for even spacing
  return hueCycle % 360;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const noiseRect = noiseCanvas.getBoundingClientRect();
  noiseCanvas.width = noiseRect.width * dpr;
  noiseCanvas.height = noiseRect.height * dpr;
  noiseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  recomputeVoronoi();
  render();
  if (noiseVisible) {
    renderNoisePreview();
  }
}

function addTile() {
  const id = `tile-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const label = `Tile ${centers.length + 1}`;
  const center = {
    id,
    label,
    hue: randomHue(),
    x: Math.random(),
    y: Math.random(),
    elevation: Math.random(),
  };
  centers.push(center);
  selectedId = id;
  recomputeVoronoi();
  render();
  if (noiseVisible) {
    renderNoisePreview();
  }
}

function removeSelectedTile() {
  if (!selectedId) return;
  const index = centers.findIndex((c) => c.id === selectedId);
  if (index >= 0) {
    centers.splice(index, 1);
    selectedId = null;
    recomputeVoronoi();
    render();
    if (noiseVisible) {
      renderNoisePreview();
    }
  }
}

function recomputeVoronoi() {
  if (centers.length === 0) {
    voronoi = null;
    return;
  }
  const points = centers.map((c) => [c.x * canvas.width, c.y * canvas.height]);
  if (points.length === 1) {
    voronoi = null;
    return;
  }
  const delaunay = Delaunay.from(points);
  voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);
}

function getShade(elevation) {
  return 50 + elevation * 50;
}

function getElevationGray(elevation) {
  const pct = 20 + elevation * 60;
  return `hsl(0, 0%, ${pct}%)`;
}

function drawVoronoi() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";

  if (centers.length === 1) {
    const [center] = centers;
    const shade = getShade(center.elevation);
    ctx.fillStyle = elevationOnly
      ? getElevationGray(center.elevation)
      : `hsl(${center.hue}, 50%, ${shade}%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (voronoi) {
    centers.forEach((center, index) => {
      const polygon = voronoi.cellPolygon(index);
      if (!polygon) return;
      ctx.beginPath();
      ctx.moveTo(polygon[0][0], polygon[0][1]);
      for (let i = 1; i < polygon.length; i += 1) {
        ctx.lineTo(polygon[i][0], polygon[i][1]);
      }
      ctx.closePath();
      const shade = getShade(center.elevation);
      ctx.fillStyle = elevationOnly
        ? getElevationGray(center.elevation)
        : `hsl(${center.hue}, 50%, ${shade}%)`;
      ctx.fill();
      ctx.stroke();
    });
  }

  centers.forEach((center) => {
    drawCenter(center);
  });

  ctx.restore();
}

function drawCenter(center) {
  const x = center.x * canvas.width;
  const y = center.y * canvas.height;
  const shade = getShade(center.elevation);
  const fillStyle = elevationOnly
    ? getElevationGray(center.elevation)
    : `hsl(${center.hue}, 50%, ${shade}%)`;

  // Balloon stalk
  const height = center.elevation * BALLOON_SCALE;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - height);
  ctx.stroke();

  // Handle
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.arc(x, y - height, HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Center circle
  ctx.beginPath();
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = center.id === selectedId ? "#ffffff" : "rgba(255,255,255,0.5)";
  ctx.lineWidth = center.id === selectedId ? 3 : 1.5;
  ctx.arc(x, y, CIRCLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Label background
  ctx.font = "14px/1.4 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelY = y + LABEL_OFFSET;
  const metrics = ctx.measureText(center.label);
  const paddingX = 12;
  const paddingY = 6;
  const textWidth = metrics.width;
  const rectWidth = textWidth + paddingX * 2;
  const rectHeight = 20;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(x - rectWidth / 2, labelY - paddingY / 2, rectWidth, rectHeight);
  ctx.fillStyle = "#f9f9f9";
  ctx.fillText(center.label, x, labelY);
}

function render() {
  drawVoronoi();
}

function pickTile(pos) {
  let closest = null;
  let bestDist = Infinity;
  centers.forEach((center) => {
    const dx = pos.x - center.x * canvas.width;
    const dy = pos.y - center.y * canvas.height;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      closest = center;
    }
  });
  return bestDist <= CIRCLE_RADIUS + 8 ? closest : null;
}

function pickHandle(pos) {
  return centers.find((center) => {
    const x = center.x * canvas.width;
    const y = center.y * canvas.height - center.elevation * BALLOON_SCALE;
    const dist = Math.hypot(pos.x - x, pos.y - y);
    return dist <= HANDLE_RADIUS + 6;
  });
}

function handlePointerDown(event) {
  const rect = canvas.getBoundingClientRect();
  const pos = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  const handle = pickHandle(pos);
  if (handle) {
    dragging = { type: "elevation", center: handle };
    selectedId = handle.id;
    render();
    return;
  }

  const tile = pickTile(pos);
  if (tile) {
    dragging = { type: "position", center: tile, offsetX: pos.x - tile.x * canvas.width, offsetY: pos.y - tile.y * canvas.height };
    selectedId = tile.id;
  } else {
    selectedId = null;
  }
  render();
}

function handlePointerMove(event) {
  if (!dragging) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const pos = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  if (dragging.type === "position") {
    const { center, offsetX, offsetY } = dragging;
    center.x = clamp((pos.x - offsetX) / canvas.width, 0, 1);
    center.y = clamp((pos.y - offsetY) / canvas.height, 0, 1);
    recomputeVoronoi();
    render();
  } else if (dragging.type === "elevation") {
    const { center } = dragging;
    const height = clamp((center.y * canvas.height - pos.y) / BALLOON_SCALE, 0, 1);
    center.elevation = height;
    render();
  }
  if (noiseVisible) {
    renderNoisePreview();
  }
}

function handlePointerUp() {
  dragging = null;
}

function handleDoubleClick(event) {
  const rect = canvas.getBoundingClientRect();
  const pos = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  const tile = pickTile(pos);
  if (!tile) return;
  const newLabel = prompt("Tile label", tile.label);
  if (newLabel && newLabel.trim().length > 0) {
    tile.label = newLabel.trim();
    if (!tile.id || tile.id.startsWith("tile-")) {
      const baseId = tile.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
      tile.id = baseId || `tile-${Date.now()}`;
    }
    selectedId = tile.id;
    render();
    if (noiseVisible) {
      renderNoisePreview();
    }
  }
}

function handleKeyDown(event) {
  if (event.key === "Delete" || event.key === "Backspace") {
    removeSelectedTile();
  }
}

function toggleElevationMode() {
  elevationOnly = !elevationOnly;
  toggleElevationBtn.classList.toggle("active", elevationOnly);
  toggleElevationBtn.textContent = elevationOnly ? "Show Tile Colors" : "Toggle Elevation Mode";
  render();
  if (noiseVisible) {
    renderNoisePreview();
  }
}

function toggleNoisePreview() {
  noiseVisible = !noiseVisible;
  toggleNoiseBtn.classList.toggle("active", noiseVisible);
  toggleNoiseBtn.textContent = noiseVisible ? "Hide Noise Map" : "Generate Noise Map";
  if (noiseVisible) {
    noiseGenerator = createNoise3D();
    renderNoisePreview();
  } else {
    noiseCtx.clearRect(0, 0, noiseCanvas.width, noiseCanvas.height);
  }
}

function renderNoisePreview() {
  if (!noiseVisible) return;
  const width = noiseCanvas.width;
  const height = noiseCanvas.height;
  if (width === 0 || height === 0) return;
  const imageData = noiseCtx.createImageData(width, height);
  const data = imageData.data;
  const freq = 2.8;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / height;
      const temp = (noiseGenerator(nx * freq, ny * freq, 0) + 1) * 0.5;
      const moist = (noiseGenerator(nx * freq, ny * freq, 100) + 1) * 0.5;
      const elev = (noiseGenerator(nx * freq, ny * freq, 200) + 1) * 0.5;
      const tileId = getTileAt(temp, moist, elev);
      const tile = centers.find((c) => c.id === tileId);
      let color;
      if (tile) {
        if (elevationOnly) {
          const gray = getElevationGray(tile.elevation);
          const match = gray.match(/(\d+(?:\.\d+)?)%/);
          const pct = match ? parseFloat(match[1]) : 50;
          const val = Math.round((pct / 100) * 255);
          color = [val, val, val];
        } else {
          const shade = getShade(tile.elevation);
          color = hslToRgb(tile.hue, 0.5, shade / 100);
        }
      } else {
        color = [20, 20, 20];
      }
      const index = (x + y * width) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }

  noiseCtx.putImageData(imageData, 0, 0);
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, hue + 1 / 3);
    g = hue2rgb(p, q, hue);
    b = hue2rgb(p, q, hue - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hue2rgb(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function exportJson() {
  if (!centers.length) return;
  const payload = centers.map(({ id, label, x, y, elevation }) => ({ id, label, x, y, elevation }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  if (window.saveAs) {
    window.saveAs(blob, "tile-centers.json");
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tile-centers.json";
    a.click();
    URL.revokeObjectURL(url);
  }
}

function init() {
  window.addEventListener("resize", resizeCanvases);
  window.addEventListener("keydown", handleKeyDown);
  canvas.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("dblclick", handleDoubleClick);
  addTileBtn.addEventListener("click", addTile);
  toggleElevationBtn.addEventListener("click", toggleElevationMode);
  toggleNoiseBtn.addEventListener("click", toggleNoisePreview);
  exportBtn.addEventListener("click", exportJson);

  resizeCanvases();
  // start with a couple of tiles for context
  for (let i = 0; i < 3; i += 1) {
    addTile();
  }
}

function getTileAt(temp, moist, elev) {
  let nearest = null;
  let bestDist = Infinity;
  centers.forEach((c) => {
    const dx = temp - c.x;
    const dy = moist - c.y;
    const dz = elev - c.elevation;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      nearest = c;
    }
  });
  return nearest ? nearest.id : null;
}

window.getTileAt = getTileAt;

init();
