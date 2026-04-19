// Consistent map marker icons that match the stop card icons
// Using SVG icons: Boot (hike), Tent (camp), Eye (viewpoint), GasPump (gas), MapPin (default)

// Colors from site custom accent colors (index.css) - darkened 20% for map markers
// Original accent colors preserved in CSS, these are just for map icon visibility
const MARKER_COLORS = {
  hike: { bg: '#3c8a79', text: '#ffffff' },      // accent-pinesoft darkened hsl(167 39% 39%)
  camp: { bg: '#a855f7', text: '#ffffff' },      // accent-wildviolet darkened hsl(280 80% 54%)
  viewpoint: { bg: '#4a96ed', text: '#ffffff' }, // accent-skyblue darkened hsl(212 86% 62%)
  gas: { bg: '#e85a9a', text: '#ffffff' },       // accent-blushorchid darkened hsl(332 76% 63%)
  photo: { bg: '#e85a9a', text: '#ffffff' },     // accent-blushorchid darkened hsl(332 76% 63%)
  start: { bg: '#34b5a5', text: '#ffffff' },     // accent-aquateal darkened hsl(171 60% 51%)
  end: { bg: '#34b5a5', text: '#ffffff' },       // accent-aquateal darkened hsl(171 60% 51%)
  default: { bg: '#6b5ce6', text: '#ffffff' },   // accent-lavenderslate darkened hsl(249 80% 60%)
};

// All Phosphor icon paths use 256x256 viewBox - Regular (outline) weight for cleaner look

// Boot icon - Phosphor regular weight (256x256 viewBox)
const bootPath = `M192,112H160V56a16,16,0,0,0-16-16H32A16,16,0,0,0,16.29,65.07c10.53,27.46,8.29,79.31-.5,109.21A16.1,16.1,0,0,0,16,176v24a16,16,0,0,0,16,16H66.11a16,16,0,0,0,7.16-1.69L85.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69h28.22a16,16,0,0,0,7.16-1.69L169.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69H232a16,16,0,0,0,16-16V168A56.06,56.06,0,0,0,192,112ZM32,176V169.73c9.77-33.22,12-88.59.82-119.73H144v62H112a8,8,0,0,0,0,16h32v-8h48a40,40,0,0,1,40,40v16H32Zm200,24H205.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H169.89a16,16,0,0,0-7.16,1.69L150.11,200H121.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H85.89a16,16,0,0,0-7.16,1.69L66.11,200H32v-8H232Z`;

// Tent icon - Phosphor regular weight (256x256 viewBox)
const tentPath = `M255.31,188.75l-64-144A8,8,0,0,0,184,40H72a8,8,0,0,0-7.27,4.69.21.21,0,0,0,0,.06l0,.12,0,0L.69,188.75A8,8,0,0,0,8,200H248a8,8,0,0,0,7.31-11.25ZM64,184H20.31L64,85.7Zm16,0V85.7L123.69,184Zm61.2,0L84.31,56H178.8l56.89,128Z`;

// Eye icon - Phosphor regular weight (256x256 viewBox)
const eyePath = `M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z`;

// GasPump icon - Phosphor regular weight (256x256 viewBox)
const gasPumpPath = `M241,69.66,221.66,50.34a8,8,0,0,0-11.32,11.32L229.66,81A8,8,0,0,1,232,86.63V168a8,8,0,0,1-16,0V128a24,24,0,0,0-24-24H176V56a24,24,0,0,0-24-24H72A24,24,0,0,0,48,56V208H32a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16H176V120h16a8,8,0,0,1,8,8v40a24,24,0,0,0,48,0V86.63A23.85,23.85,0,0,0,241,69.66ZM64,56a8,8,0,0,1,8-8h80a8,8,0,0,1,8,8v56H64Zm96,152H64V128h96Z`;

// MapPinArea icon - Phosphor regular weight (256x256 viewBox) - for destinations
const mapPinAreaPath = `M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z`;

// MapPin icon - Phosphor regular weight (256x256 viewBox) - for start/end locations
const mapPinPath = `M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z`;

// Camera icon - Phosphor regular weight (256x256 viewBox)
const cameraPath = `M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.66-3.56L100.28,48h55.43l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z`;

function getIconPath(type: string): string {
  switch (type) {
    case 'hike':
      return bootPath;
    case 'camp':
      return tentPath;
    case 'gas':
      return gasPumpPath;
    case 'start':
    case 'end':
      return mapPinPath;
    case 'photo':
      return cameraPath;
    default:
      return mapPinAreaPath;
  }
}

function getColors(type: string) {
  return MARKER_COLORS[type as keyof typeof MARKER_COLORS] || MARKER_COLORS.default;
}

export function createMarkerIcon(
  type: string,
  options: {
    isActive?: boolean;
    size?: number;
    showLabel?: boolean;
    label?: string;
    customColor?: string; // Override the default background color
  } = {}
): google.maps.Icon | null {
  // Safety check - ensure Google Maps is loaded
  if (typeof google === 'undefined' || !google.maps || !google.maps.Size) {
    console.warn('Google Maps not loaded yet, cannot create marker icon');
    return null;
  }

  const { isActive = false, size = 36, showLabel = false, label, customColor } = options;
  const colors = getColors(type);
  const bgColor = customColor || colors.bg;
  const actualSize = isActive ? size * 1.2 : size;
  // Only show a dark border when active, no border otherwise
  const strokeAttr = isActive ? 'stroke="#3f3e2c" stroke-width="2"' : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}" viewBox="0 0 36 36">
      <!-- Background circle - no border by default -->
      <circle cx="18" cy="18" r="17" fill="${bgColor}" ${strokeAttr}/>
      <!-- Icon at 20px using nested SVG to scale from 256x256 viewBox -->
      <svg x="8" y="8" width="20" height="20" viewBox="0 0 256 256">
        <path d="${getIconPath(type)}" fill="${colors.text}"/>
      </svg>
      ${showLabel && label ? `
        <text x="18" y="32" text-anchor="middle" font-size="10" font-weight="bold" fill="${bgColor}">${label}</text>
      ` : ''}
    </svg>
  `;

  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(actualSize, actualSize),
    anchor: new google.maps.Point(actualSize / 2, actualSize / 2),
  };
}

// Simpler circle markers with just a colored dot (for smaller/less important markers)
export function createSimpleMarkerIcon(
  type: string,
  options: { isActive?: boolean; size?: number } = {}
): google.maps.Symbol | null {
  // Safety check - ensure Google Maps is loaded
  if (typeof google === 'undefined' || !google.maps || !google.maps.SymbolPath) {
    console.warn('Google Maps not loaded yet, cannot create simple marker icon');
    return null;
  }

  const { isActive = false, size = 8 } = options;
  const colors = getColors(type);

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: colors.bg,
    fillOpacity: 1,
    strokeColor: isActive ? '#3f3e2c' : '#ffffff',
    strokeWeight: isActive ? 2 : 1,
    scale: isActive ? size * 1.25 : size,
  };
}

// Get the marker color for a stop type
export function getMarkerColor(type: string): string {
  return getColors(type).bg;
}

// Get photo hotspot color based on photo count (lighter = fewer photos, darker = more photos)
// Based on accent-blushorchid: hsl(332, 76%, 79%)
export function getPhotoHotspotColor(photoCount: number): string {
  // Blushorchid variations with more dramatic lightness differences
  // Base: hsl(332, 76%, L%) where L varies significantly
  if (photoCount < 20) {
    return 'hsl(332, 76%, 88%)'; // Very light pink
  } else if (photoCount < 50) {
    return 'hsl(332, 76%, 72%)'; // Light pink
  } else if (photoCount < 100) {
    return 'hsl(332, 76%, 55%)'; // Medium pink
  } else {
    return 'hsl(332, 76%, 38%)'; // Dark pink - much darker for popular spots
  }
}

// Type styles for consistency with card styling (uses accent color tokens)
export function getTypeStyles(type: string): string {
  switch (type) {
    case 'hike':
      return 'bg-pinesoft/20 text-emerald-800 dark:text-emerald-300 border-pinesoft/30';
    case 'camp':
      return 'bg-wildviolet/20 text-purple-800 dark:text-purple-300 border-wildviolet/30';
    case 'viewpoint':
      return 'bg-skyblue/20 text-blue-800 dark:text-blue-300 border-skyblue/30';
    case 'gas':
      return 'bg-blushorchid/20 text-pink-800 dark:text-pink-300 border-blushorchid/30';
    case 'photo':
      return 'bg-blushorchid/20 text-pink-800 dark:text-pink-300 border-blushorchid/30';
    case 'start':
    case 'end':
      return 'bg-aquateal/20 text-teal-800 dark:text-teal-300 border-aquateal/30';
    default:
      return 'bg-lavenderslate/20 text-indigo-800 dark:text-indigo-300 border-lavenderslate/30';
  }
}
