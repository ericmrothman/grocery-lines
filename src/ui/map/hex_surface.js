import { SURFACE_SHAPES, surfaceOpacity } from './map_theme.js';
import { STEP_TRANSITION, transitionLengthMs, rippleDelaysMs, transitionFrame, easedShare } from '../shared/transition.js';

const TRIANGLE_CORNERS_OF_A_HEXAGON = Object.freeze([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
export const SURFACE_VERTICES_PER_CELL = TRIANGLE_CORNERS_OF_A_HEXAGON.length;
export const SURFACE_FLOATS_PER_VERTEX = 7;
const HEXAGON_INRADIUS = Math.sqrt(3) / 2;
const EDGE_ROOM = 0.06;
const HEX_MORPH_HALF_WIDTH_ZOOMS = 0.4;
const SMALLEST_MORPHED_HEX = 0.92;
const FLANNERY_EXPONENT = 0.5716;
const FULL_SIZE_SHARE = 0.98;

export function hexMorphShare(surface, zoom) {
  const morphs = surface.hexFromZoom > 0 && (surface.shape === 'dot' || surface.shape === 'ring');
  if (!morphs) return 0;
  return Math.min(1, Math.max(0, (zoom - (surface.hexFromZoom - HEX_MORPH_HALF_WIDTH_ZOOMS)) / (2 * HEX_MORPH_HALF_WIDTH_ZOOMS)));
}

function glowRadius(surface) {
  return surface.glow > 0 ? HEXAGON_INRADIUS * surface.size * (1.4 + 0.35 * surface.glow) : 0;
}

export function surfaceDrawScale(surface) {
  const fullCell = surface.shape === 'hex' && surface.size >= 1 && surface.glow === 0 && !surface.sizeByHomes;
  if (fullCell) return 1;
  const reach = Math.max(surface.size, surface.ghost.size, SMALLEST_MORPHED_HEX, glowRadius(surface) / HEXAGON_INRADIUS);
  return reach + EDGE_ROOM;
}

export function surfaceUniforms(definition, { zoom, cellRadiusPx, hasTrip }) {
  const surface = definition.surface;
  const ghost = surface.ghost;
  const drawScale = surfaceDrawScale(surface);
  return {
    shape: SURFACE_SHAPES.indexOf(surface.shape),
    size: surface.size,
    sizeByHomes: surface.sizeByHomes ? 1 : 0,
    homesFloor: surface.homesFloor,
    gappedSize: surface.gappedSize,
    hexMorph: hexMorphShare(surface, zoom),
    glow: surface.glow,
    opacity: surfaceOpacity(definition, hasTrip),
    ghostSize: ghost.size,
    ghostOpacity: ghost.visible ? ghost.opacity : 0,
    edgeWidth: 1 / Math.max(cellRadiusPx, 1),
    drawScale,
    fullCell: drawScale === 1 ? 1 : 0,
  };
}

export function mercatorFromLonLat([lon, lat]) {
  const latitudeRadians = (lat * Math.PI) / 180;
  return [(lon + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)) / Math.PI) / 2];
}

export function homesShare(households, fullSizeHouseholds) {
  if (!(households > 0) || !(fullSizeHouseholds > 0)) return 0;
  return Math.min(1, households / fullSizeHouseholds) ** FLANNERY_EXPONENT;
}

export function fullSizeHouseholds(cells) {
  const livedIn = cells.filter((cell) => cell.populated).map((cell) => cell.households).sort((a, b) => a - b);
  return livedIn.find((households, index) => index + 1 >= FULL_SIZE_SHARE * livedIn.length) ?? 0;
}

export function hexSurfaceGeometry(cells, { centerOf, cornersOf }) {
  const origin = mercatorFromLonLat(cornersOf(0)[0]);
  const fullSize = fullSizeHouseholds(cells);
  const vertices = new Float32Array(cells.length * SURFACE_VERTICES_PER_CELL * SURFACE_FLOATS_PER_VERTEX);
  cells.forEach((cell, cellIndex) => {
    const center = mercatorFromLonLat([centerOf(cellIndex).lon, centerOf(cellIndex).lat]);
    const corners = cornersOf(cellIndex).map(mercatorFromLonLat);
    const weight = homesShare(cell.households, fullSize);
    TRIANGLE_CORNERS_OF_A_HEXAGON.forEach((corner, vertex) => {
      const angle = ((60 * corner + 90) * Math.PI) / 180;
      const at = (cellIndex * SURFACE_VERTICES_PER_CELL + vertex) * SURFACE_FLOATS_PER_VERTEX;
      vertices.set([center[0] - origin[0], center[1] - origin[1], corners[corner][0] - center[0], corners[corner][1] - center[1], Math.cos(angle), Math.sin(angle), weight], at);
    });
  });
  return { vertices, origin, vertexCount: cells.length * SURFACE_VERTICES_PER_CELL };
}

export function hexSurfaceColors(fills, rgbaFor) {
  const colors = new Uint8Array(fills.length * SURFACE_VERTICES_PER_CELL * 4);
  fills.forEach((fill, cellIndex) => {
    if (!fill) return;
    const [red, green, blue] = rgbaFor(fill);
    const rgba = [red, green, blue, 255];
    for (let vertex = 0; vertex < SURFACE_VERTICES_PER_CELL; vertex++) colors.set(rgba, (cellIndex * SURFACE_VERTICES_PER_CELL + vertex) * 4);
  });
  return colors;
}

export function translatedMatrix(matrix, [x, y]) {
  const translated = Array.from(matrix);
  for (let row = 0; row < 4; row++) translated[12 + row] = matrix[row] * x + matrix[4 + row] * y + matrix[12 + row];
  return translated;
}

const VERTEX_SHADER = `
uniform mat4 u_matrix;
uniform float u_drawScale;
attribute vec2 a_center;
attribute vec2 a_corner;
attribute vec2 a_unit;
attribute float a_weight;
attribute vec4 a_color;
varying vec2 v_local;
varying vec4 v_color;
varying float v_weight;
void main() {
  gl_Position = u_matrix * vec4(a_center + a_corner * u_drawScale, 0.0, 1.0);
  v_local = a_unit * u_drawScale;
  v_color = a_color;
  v_weight = a_weight;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform float u_shape;
uniform float u_size;
uniform float u_sizeByHomes;
uniform float u_homesFloor;
uniform float u_gapped;
uniform float u_gappedSize;
uniform float u_hexMorph;
uniform float u_glow;
uniform float u_opacity;
uniform float u_ghostSize;
uniform vec4 u_ghost;
uniform float u_edgeWidth;
uniform float u_fullCell;
varying vec2 v_local;
varying vec4 v_color;
varying float v_weight;
const float INRADIUS = 0.8660254;

float hexDistance(vec2 p, float radius) {
  vec2 q = abs(p);
  return max(q.x, 0.5 * q.x + INRADIUS * q.y) - INRADIUS * radius;
}

float shapeDistance(vec2 p, float size) {
  float halfWidth = INRADIUS * size;
  vec2 q = abs(p);
  if (u_shape < 0.5) return hexDistance(p, size);
  if (u_shape < 1.5) return length(p) - halfWidth;
  if (u_shape < 2.5) {
    float ring = halfWidth * 0.3;
    return abs(length(p) - halfWidth - ring * 0.5) - ring * 0.5;
  }
  if (u_shape < 3.5) return max(q.x, q.y) - halfWidth;
  return (q.x + q.y - halfWidth) * 0.70710678;
}

float coverage(float distance) {
  return clamp(0.5 - distance / u_edgeWidth, 0.0, 1.0);
}

void main() {
  float scale = v_color.a;
  float ghostCovered = coverage(length(v_local) - INRADIUS * u_ghostSize) * u_ghost.a * (1.0 - scale);
  float alpha = 0.0;
  if (scale > 0.0) {
    float homes = mix(u_homesFloor, 1.0, v_weight);
    float size = u_size * mix(1.0, homes, u_sizeByHomes) * mix(1.0, u_gappedSize, u_gapped) * scale;
    float covered = u_fullCell > 0.5 && scale >= 1.0 ? 1.0 : coverage(shapeDistance(v_local, size));
    if (u_hexMorph > 0.0) covered = mix(covered, coverage(hexDistance(v_local, max(u_size, 0.92) * scale)), u_hexMorph);
    if (u_glow > 0.0) {
      float reach = INRADIUS * size * (1.4 + 0.35 * u_glow);
      float glow = min(0.9, 0.25 + 0.06 * u_glow) * clamp(1.0 - length(v_local) / reach, 0.0, 1.0);
      covered = covered + glow * (1.0 - covered);
    }
    alpha = covered * u_opacity;
  }
  float under = ghostCovered * (1.0 - alpha);
  if (alpha + under <= 0.0) discard;
  gl_FragColor = vec4(v_color.rgb * alpha + u_ghost.rgb * under, alpha + under);
}`;

const ATTRIBUTES = Object.freeze([['a_center', 2, 0], ['a_corner', 2, 2], ['a_unit', 2, 4], ['a_weight', 1, 6]]);
const UNIFORMS = Object.freeze(['u_matrix', 'u_drawScale', 'u_shape', 'u_size', 'u_sizeByHomes', 'u_homesFloor', 'u_gapped', 'u_gappedSize', 'u_hexMorph', 'u_glow', 'u_opacity', 'u_ghostSize', 'u_ghost', 'u_edgeWidth', 'u_fullCell']);

function compiledShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Hexagon shader: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

function linkedProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compiledShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compiledShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Hexagon program: ${gl.getProgramInfoLog(program)}`);
  return program;
}

export function createHexSurfaceLayer(id, buildGeometry) {
  let gl = null;
  let map = null;
  let drawing = null;
  let colors = null;
  let colorsChanged = false;
  let look = null;

  return {
    id,
    type: 'custom',
    renderingMode: '2d',
    onAdd(addedMap, context) {
      map = addedMap;
      gl = context;
      const program = linkedProgram(gl);
      const geometry = buildGeometry();
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
      drawing = {
        program,
        vertexBuffer,
        colorBuffer: gl.createBuffer(),
        origin: geometry.origin,
        vertexCount: geometry.vertexCount,
        attributes: ATTRIBUTES.map(([name, size, offset]) => ({ location: gl.getAttribLocation(program, name), size, offset })),
        color: gl.getAttribLocation(program, 'a_color'),
        uniforms: Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])),
      };
      colorsChanged = true;
    },
    onRemove() {
      gl.deleteBuffer(drawing.vertexBuffer);
      gl.deleteBuffer(drawing.colorBuffer);
      gl.deleteProgram(drawing.program);
      drawing = null;
      gl = null;
    },
    render(context, input) {
      if (!drawing || !colors || !look) return;
      const uniforms = drawing.uniforms;
      gl.useProgram(drawing.program);
      if (colorsChanged) {
        gl.bindBuffer(gl.ARRAY_BUFFER, drawing.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
        colorsChanged = false;
      }
      const stride = SURFACE_FLOATS_PER_VERTEX * 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, drawing.vertexBuffer);
      for (const attribute of drawing.attributes) {
        gl.enableVertexAttribArray(attribute.location);
        gl.vertexAttribPointer(attribute.location, attribute.size, gl.FLOAT, false, stride, attribute.offset * 4);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, drawing.colorBuffer);
      gl.enableVertexAttribArray(drawing.color);
      gl.vertexAttribPointer(drawing.color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
      const current = look();
      gl.uniformMatrix4fv(uniforms.u_matrix, false, translatedMatrix(input.defaultProjectionData.mainMatrix, drawing.origin));
      for (const [name, value] of Object.entries({ u_drawScale: current.drawScale, u_shape: current.shape, u_size: current.size, u_sizeByHomes: current.sizeByHomes, u_homesFloor: current.homesFloor, u_gapped: current.gapped, u_gappedSize: current.gappedSize, u_hexMorph: current.hexMorph, u_glow: current.glow, u_opacity: current.opacity, u_ghostSize: current.ghostSize, u_edgeWidth: current.edgeWidth, u_fullCell: current.fullCell })) gl.uniform1f(uniforms[name], value);
      gl.uniform4fv(uniforms.u_ghost, current.ghost);
      gl.drawArrays(gl.TRIANGLES, 0, drawing.vertexCount);
      for (const attribute of drawing.attributes) gl.disableVertexAttribArray(attribute.location);
      gl.disableVertexAttribArray(drawing.color);
    },
    showColors(nextColors) {
      colors = nextColors;
      colorsChanged = true;
      map?.triggerRepaint();
    },
    showLook(readLook) {
      look = readLook;
      map?.triggerRepaint();
    },
  };
}

function createColorReader() {
  const colorSample = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgbaByColor = new Map();
  return {
    rgbaFor(color) {
      if (!rgbaByColor.has(color)) {
        colorSample.clearRect(0, 0, 1, 1);
        colorSample.fillStyle = color;
        colorSample.fillRect(0, 0, 1, 1);
        rgbaByColor.set(color, colorSample.getImageData(0, 0, 1, 1).data);
      }
      return rgbaByColor.get(color);
    },
    forget() {
      rgbaByColor.clear();
    },
  };
}

export function createHexSurface({ layerId, cells, centres, cornersOf, animates, requestRepaint }) {
  const layer = createHexSurfaceLayer(layerId, () => hexSurfaceGeometry(cells, { centerOf: (index) => centres[index], cornersOf }));
  const colorReader = createColorReader();
  let shownFills = null;
  let shownColors = null;
  let shownStep = null;
  let stepChange = null;
  let sizeByHomesNow = null;
  let gappedNow = null;
  let opacityGlide = null;

  function animateStepChange(now) {
    if (!stepChange) return;
    const elapsedMs = now - stepChange.startedAt;
    const frame = transitionFrame(stepChange, elapsedMs);
    stepChange.shownColors = frame.colors;
    layer.showColors(frame.colors);
    const eased = easedShare(elapsedMs, transitionLengthMs(STEP_TRANSITION));
    sizeByHomesNow = stepChange.fromSize + (stepChange.toSize - stepChange.fromSize) * eased;
    gappedNow = stepChange.fromGapped + (stepChange.toGapped - stepChange.fromGapped) * eased;
    requestRepaint();
    if (frame.isDone) stepChange = null;
    else requestAnimationFrame(animateStepChange);
  }

  function opacityAt(glide, now) {
    return glide.from + (glide.to - glide.from) * easedShare(now - glide.startedAt, transitionLengthMs(STEP_TRANSITION));
  }

  function easedOpacity(target, now) {
    if (!animates) return target;
    if (!opacityGlide) opacityGlide = { from: target, to: target, startedAt: now };
    if (opacityGlide.to !== target) opacityGlide = { from: opacityAt(opacityGlide, now), to: target, startedAt: now };
    const opacity = opacityAt(opacityGlide, now);
    if (opacity !== target) requestRepaint();
    return opacity;
  }

  return {
    layer,
    show({ fills, look, sizeByHomes, gapped = false, rippleOrigin }) {
      const isUnchanged = shownFills && fills.every((fill, index) => fill === shownFills[index]);
      const targetSize = Number(Boolean(sizeByHomes));
      const targetGapped = Number(Boolean(gapped));
      const stepChanged = shownStep !== null && look !== shownStep;
      shownStep = look;
      if (isUnchanged && !stepChanged) return;
      const nextColors = isUnchanged ? shownColors : hexSurfaceColors(fills, colorReader.rgbaFor);
      if (stepChanged && animates && shownColors) {
        const fromColors = stepChange?.shownColors ?? shownColors;
        stepChange = { startedAt: performance.now(), from: fromColors, to: nextColors, shownColors: fromColors, delaysMs: rippleDelaysMs(centres, rippleOrigin, STEP_TRANSITION.rippleMs), cellMs: STEP_TRANSITION.cellMs, verticesPerCell: SURFACE_VERTICES_PER_CELL, fromSize: sizeByHomesNow ?? targetSize, toSize: targetSize, fromGapped: gappedNow ?? targetGapped, toGapped: targetGapped };
        requestAnimationFrame(animateStepChange);
      } else {
        stepChange = null;
        sizeByHomesNow = targetSize;
        gappedNow = targetGapped;
        layer.showColors(nextColors);
      }
      shownColors = nextColors;
      shownFills = fills;
    },
    readFrameFrom(readFrame) {
      layer.showLook(() => {
        const frame = readFrame();
        const uniforms = surfaceUniforms(frame.definition, { zoom: frame.zoom, cellRadiusPx: frame.cellRadiusPx, hasTrip: frame.hasTrip });
        const sizeByHomes = typeof frame.sizeByHomes === 'boolean' ? sizeByHomesNow ?? Number(frame.sizeByHomes) : uniforms.sizeByHomes;
        const opacity = easedOpacity(uniforms.opacity, performance.now());
        const gapped = gappedNow ?? 0;
        return { ...uniforms, opacity, sizeByHomes, gapped, fullCell: sizeByHomes > 0 || gapped > 0 ? 0 : uniforms.fullCell, hexMorph: uniforms.hexMorph * (1 - sizeByHomes), ghost: frame.ghost };
      });
    },
    forgetColors() {
      colorReader.forget();
    },
  };
}
