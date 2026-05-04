// Marker content builders for google.maps.marker.AdvancedMarkerElement.
//
// Returns HTMLElement values to assign to AdvancedMarkerElement.content
// (the DOM-based content model that replaced the deprecated
// google.maps.Marker / SymbolPath icons in Feb 2024).
//
// Two builders:
//   - createMarkerIcon(type)        — full-size pin with a Phosphor icon glyph
//   - createSimpleMarkerIcon(type)  — small colored circle dot
//
// Colors come from the brand style guide (CSS custom props in index.css)
// so light/dark themes stay in sync with the rest of the app. Icon glyphs
// are Phosphor "fill" weight.

// Style guide tokens for each marker type. Resolved to HSL strings at render
// time so theme switches stay consistent with the rest of the UI.
const MARKER_COLOR_VARS: Record<string, string> = {
  hike:      '--sage',
  camp:      '--clay',
  viewpoint: '--water',
  gas:       '--ember',
  photo:     '--ink-2',
  start:     '--pine-6',
  end:       '--pine-6',
  default:   '--pine-6',
};

function readCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function tokenColor(name: string): string {
  const value = readCssVar(name);
  return value ? `hsl(${value})` : '#000';
}

function getMarkerBg(type: string): string {
  const variable = MARKER_COLOR_VARS[type] || MARKER_COLOR_VARS.default;
  return tokenColor(variable);
}

function getMarkerFg(): string {
  return tokenColor('--cream');
}

// Phosphor icon paths — "fill" weight (256x256 viewBox).
const bootFillPath = `M192,112H112.27a8.17,8.17,0,0,1-8.25-7.47A8,8,0,0,1,112,96h44a4,4,0,0,0,4-4V84a4,4,0,0,0-4-4H112.27A8.17,8.17,0,0,1,104,72.53,8,8,0,0,1,112,64h44a4,4,0,0,0,4-4V56a16,16,0,0,0-16-16H32.22a8.23,8.23,0,0,0-5.08,1.64,8,8,0,0,0-2.61,9.22c11.06,28.84,8.76,83.71-.22,114.93A8,8,0,0,0,24,168v32a16,16,0,0,0,16,16H66.11a16,16,0,0,0,7.16-1.69L85.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69h28.22a16,16,0,0,0,7.16-1.69L169.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69H232a16,16,0,0,0,16-16V168A56,56,0,0,0,192,112Zm40,88H205.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H169.89a16,16,0,0,0-7.16,1.69L150.11,200H121.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H85.89a16,16,0,0,0-7.16,1.69L66.11,200H40V176H232Z`;
const tentFillPath = `M255.31,188.75l-64-144A8,8,0,0,0,184,40H72a8,8,0,0,0-7.31,4.75h0l0,.12v0L.69,188.75A8,8,0,0,0,8,200H248a8,8,0,0,0,7.31-11.25ZM64,184H20.31L64,85.7Zm16,0V85.7L123.69,184Z`;
const gasPumpFillPath = `M241,69.66,221.66,50.34a8,8,0,0,0-11.32,11.32L229.66,81A8,8,0,0,1,232,86.63V168a8,8,0,0,1-16,0V128a24,24,0,0,0-24-24H176V56a24,24,0,0,0-24-24H72A24,24,0,0,0,48,56V208H32a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16H176V120h16a8,8,0,0,1,8,8v40a24,24,0,0,0,48,0V86.63A23.85,23.85,0,0,0,241,69.66ZM144,120H80a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Z`;
const mapPinFillPath = `M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z`;
const cameraFillPath = `M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm-44,76a36,36,0,1,1-36-36A36,36,0,0,1,164,132Z`;
function getIconPath(type: string): string {
  switch (type) {
    case 'hike':            return bootFillPath;
    case 'camp':            return tentFillPath;
    case 'gas':             return gasPumpFillPath;
    case 'viewpoint':       return mapPinFillPath;
    case 'photo':           return cameraFillPath;
    case 'start': case 'end': return mapPinFillPath;
    default:                return mapPinFillPath;
  }
}


/**
 * Full-size circle pin with a filled icon glyph in the middle.
 *
 * Returns an HTMLElement for `AdvancedMarkerElement.content`.
 */
export function createMarkerIcon(
  type: string,
  options: {
    isActive?: boolean;
    size?: number;
    showLabel?: boolean;
    label?: string;
    customColor?: string;
  } = {}
): HTMLElement {
  const { isActive = false, size = 28, showLabel = false, label, customColor } = options;
  const bgColor = customColor || getMarkerBg(type);
  const fgColor = getMarkerFg();
  const actualSize = isActive ? size * 1.2 : size;

  // White outline on every marker, slightly thicker when active.
  const strokeWidth = isActive ? 3 : 2;
  const strokeAttr = `stroke="#ffffff" stroke-width="${strokeWidth}"`;
  const labelEl = showLabel && label
    ? `<text x="18" y="32" text-anchor="middle" font-size="10" font-weight="bold" fill="${bgColor}">${label}</text>`
    : '';
  // Circle radius leaves room for the stroke inside the 36-unit viewBox.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}" viewBox="0 0 36 36">
    <circle cx="18" cy="18" r="16" fill="${bgColor}" ${strokeAttr}/>
    <svg x="8" y="8" width="20" height="20" viewBox="0 0 256 256">
      <path d="${getIconPath(type)}" fill="${fgColor}"/>
    </svg>
    ${labelEl}
  </svg>`;

  const wrapper = document.createElement('div');
  wrapper.style.width = `${actualSize}px`;
  wrapper.style.height = `${actualSize}px`;
  wrapper.style.cursor = 'pointer';
  wrapper.innerHTML = svg;
  return wrapper;
}

/**
 * Small colored circle dot (no icon glyph). For lower-priority markers.
 *
 * Returns an HTMLElement for `AdvancedMarkerElement.content`. The size
 * arg is the radius (matching the legacy `scale` semantics) — the
 * resulting DOM circle's diameter is 2 × size.
 */
export function createSimpleMarkerIcon(
  type: string,
  options: { isActive?: boolean; size?: number } = {}
): HTMLElement {
  const { isActive = false, size = 6 } = options;
  const radius = isActive ? size * 1.25 : size;
  const diameter = radius * 2;
  const strokeWidth = isActive ? 2 : 1.5;
  const strokeColor = '#ffffff';

  const div = document.createElement('div');
  div.style.width = `${diameter}px`;
  div.style.height = `${diameter}px`;
  div.style.borderRadius = '50%';
  div.style.backgroundColor = getMarkerBg(type);
  div.style.border = `${strokeWidth}px solid ${strokeColor}`;
  div.style.cursor = 'pointer';
  return div;
}

/** Get the marker color for a stop type (still string-based — used for non-marker UI). */
export function getMarkerColor(type: string): string {
  return getMarkerBg(type);
}

/** Photo hotspot color based on photo count (lighter = fewer, darker = more). */
export function getPhotoHotspotColor(photoCount: number): string {
  if (photoCount < 20) return 'hsl(332, 76%, 88%)';
  if (photoCount < 50) return 'hsl(332, 76%, 72%)';
  if (photoCount < 100) return 'hsl(332, 76%, 55%)';
  return 'hsl(332, 76%, 38%)';
}
