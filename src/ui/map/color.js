export const READABLE_TEXT_CONTRAST = 4.5;

function hexOf(rgb) {
  return `#${rgb.map((channel) => Number(Math.min(255, Math.max(0, channel)).toFixed(0)).toString(16).padStart(2, '0')).join('')}`;
}

export function readableOn(color, background, smallest = READABLE_TEXT_CONTRAST) {
  const target = relativeLuminance(parseColor(background)) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  const start = parseColor(color).slice(0, 3);
  for (let share = 0; share <= 1; share += 0.05) {
    const candidate = hexOf(start.map((channel, index) => channel + (target[index] - channel) * share));
    if (contrastRatio(candidate, background) >= smallest) return share === 0 ? color : candidate;
  }
  return hexOf(target);
}

export function parseColor(color) {
  const text = String(color ?? '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit) : hex[1].match(/../g);
    return [...digits.map((pair) => Number.parseInt(pair, 16)), 1];
  }
  const functional = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(text);
  if (!functional) return null;
  const alphaText = functional[4];
  const alpha = alphaText === undefined ? 1 : alphaText.endsWith('%') ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText);
  return [Number(functional[1]), Number(functional[2]), Number(functional[3]), alpha];
}

export function darkerShade(color, keptShare) {
  const rgba = parseColor(color);
  if (!rgba || !/^#/.test(String(color).trim())) return null;
  const [red, green, blue] = rgba.slice(0, 3).map((channel) => channel * keptShare);
  return `rgb(${red.toFixed(0)}, ${green.toFixed(0)}, ${blue.toFixed(0)})`;
}

export function mixedColor(color, toward, keptShare) {
  const from = parseColor(color);
  const to = parseColor(toward);
  if (!from || !to) return color;
  const [red, green, blue] = [0, 1, 2].map((channel) => from[channel] * keptShare + to[channel] * (1 - keptShare));
  return `rgb(${red.toFixed(0)}, ${green.toFixed(0)}, ${blue.toFixed(0)})`;
}

function relativeLuminance(rgba) {
  const [red, green, blue] = rgba.slice(0, 3).map((channel) => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(parseColor(first)), relativeLuminance(parseColor(second))].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function labOf(color) {
  const [red, green, blue] = parseColor(color).slice(0, 3).map((channel) => {
    const share = channel / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  const x = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047;
  const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const z = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883;
  const curve = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  return [116 * curve(y) - 16, 500 * (curve(x) - curve(y)), 200 * (curve(y) - curve(z))];
}

export function colorDifference(first, second) {
  const [a, b] = [labOf(first), labOf(second)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
