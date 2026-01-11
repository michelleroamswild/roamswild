// Consistent map marker icons that match the stop card icons
// Using SVG icons: Boot (hike), Tent (camp), Eye (viewpoint), GasPump (gas), MapPin (default)

// Colors from site custom accent colors (index.css) - darkened 20% for map markers
// Original accent colors preserved in CSS, these are just for map icon visibility
const MARKER_COLORS = {
  hike: { bg: '#3c8a79', text: '#ffffff' },      // accent-pinesoft darkened hsl(167 39% 39%)
  camp: { bg: '#ea9b0c', text: '#ffffff' },      // accent-softamber darkened hsl(40 83% 50%)
  viewpoint: { bg: '#4a96ed', text: '#ffffff' }, // accent-skyblue darkened hsl(212 86% 62%)
  gas: { bg: '#e85a9a', text: '#ffffff' },       // accent-blushorchid darkened hsl(332 76% 63%)
  photo: { bg: '#e85a9a', text: '#ffffff' },     // accent-blushorchid darkened hsl(332 76% 63%)
  start: { bg: '#34b5a5', text: '#ffffff' },     // accent-aquateal darkened hsl(171 60% 51%)
  default: { bg: '#6b5ce6', text: '#ffffff' },   // accent-lavenderslate darkened hsl(249 80% 60%)
};

// All Phosphor icon paths use 256x256 viewBox - Fill weight for solid icons

// Boot icon - Phosphor fill weight (256x256 viewBox)
const bootPath = `M192,112H112.27a8.17,8.17,0,0,1-8.25-7.47A8,8,0,0,1,112,96h44a4,4,0,0,0,4-4V84a4,4,0,0,0-4-4H112.27A8.17,8.17,0,0,1,104,72.53,8,8,0,0,1,112,64h44a4,4,0,0,0,4-4V56a16,16,0,0,0-16-16H32.22a8.23,8.23,0,0,0-5.08,1.64,8,8,0,0,0-2.61,9.22c11.06,28.84,8.76,83.71-.22,114.93A8,8,0,0,0,24,168v32a16,16,0,0,0,16,16H66.11a16,16,0,0,0,7.16-1.69L85.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69h28.22a16,16,0,0,0,7.16-1.69L169.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69H232a16,16,0,0,0,16-16V168A56,56,0,0,0,192,112Zm40,88H205.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H169.89a16,16,0,0,0-7.16,1.69L150.11,200H121.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H85.89a16,16,0,0,0-7.16,1.69L66.11,200H40V176H232Z`;

// Tent icon - Phosphor fill weight (256x256 viewBox)
const tentPath = `M255.31,188.75l-64-144A8,8,0,0,0,184,40H72a8,8,0,0,0-7.31,4.75h0l0,.12v0L.69,188.75A8,8,0,0,0,8,200H248a8,8,0,0,0,7.31-11.25ZM64,184H20.31L64,85.7Zm16,0V85.7L123.69,184Z`;

// Eye icon - Phosphor fill weight (256x256 viewBox)
const eyePath = `M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z`;

// GasPump icon - Phosphor fill weight (256x256 viewBox)
const gasPumpPath = `M241,69.66,221.66,50.34a8,8,0,0,0-11.32,11.32L229.66,81A8,8,0,0,1,232,86.63V168a8,8,0,0,1-16,0V128a24,24,0,0,0-24-24H176V56a24,24,0,0,0-24-24H72A24,24,0,0,0,48,56V208H32a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16H176V120h16a8,8,0,0,1,8,8v40a24,24,0,0,0,48,0V86.63A23.85,23.85,0,0,0,241,69.66ZM144,120H80a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Z`;

// MapPinArea icon - Phosphor fill weight (256x256 viewBox) - for destinations
const mapPinAreaPath = `M124,175a8,8,0,0,0,7.94,0c2.45-1.41,60-35,60-94.95A64,64,0,0,0,64,80C64,140,121.58,173.54,124,175ZM128,56a24,24,0,1,1-24,24A24,24,0,0,1,128,56ZM240,184c0,31.18-57.71,48-112,48S16,215.18,16,184c0-14.59,13.22-27.51,37.23-36.37a8,8,0,0,1,5.54,15C42.26,168.74,32,176.92,32,184c0,13.36,36.52,32,96,32s96-18.64,96-32c0-7.08-10.26-15.26-26.77-21.36a8,8,0,0,1,5.54-15C226.78,156.49,240,169.41,240,184Z`;

// Flag icon - Phosphor fill weight (256x256 viewBox)
const flagPath = `M232,56V176a8,8,0,0,1-2.76,6c-15.28,13.23-29.89,18-43.82,18-18.91,0-36.57-8.74-53-16.85C105.87,170,82.79,158.61,56,179.77V224a8,8,0,0,1-16,0V56a8,8,0,0,1,2.77-6h0c36-31.18,68.31-15.21,96.79-1.12C167,62.46,190.79,74.2,218.76,50A8,8,0,0,1,232,56Z`;

// Camera icon - Phosphor fill weight (256x256 viewBox)
const cameraPath = `M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm-44,76a36,36,0,1,1-36-36A36,36,0,0,1,164,132Z`;

function getIconPath(type: string): string {
  switch (type) {
    case 'hike':
      return bootPath;
    case 'camp':
      return tentPath;
    case 'gas':
      return gasPumpPath;
    case 'start':
      return flagPath;
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
  } = {}
): google.maps.Icon {
  const { isActive = false, size = 36, showLabel = false, label } = options;
  const colors = getColors(type);
  const actualSize = isActive ? size * 1.2 : size;
  // Only show a dark border when active, no border otherwise
  const strokeAttr = isActive ? 'stroke="#3f3e2c" stroke-width="2"' : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}" viewBox="0 0 36 36">
      <!-- Background circle - no border by default -->
      <circle cx="18" cy="18" r="17" fill="${colors.bg}" ${strokeAttr}/>
      <!-- Icon at 20px using nested SVG to scale from 256x256 viewBox -->
      <svg x="8" y="8" width="20" height="20" viewBox="0 0 256 256">
        <path d="${getIconPath(type)}" fill="${colors.text}"/>
      </svg>
      ${showLabel && label ? `
        <text x="18" y="32" text-anchor="middle" font-size="10" font-weight="bold" fill="${colors.bg}">${label}</text>
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
): google.maps.Symbol {
  const { isActive = false, size = 8 } = options;
  const colors = getColors(type);

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: colors.bg,
    fillOpacity: 1,
    strokeColor: isActive ? '#3f3e2c' : 'transparent',
    strokeWeight: isActive ? 2 : 0,
    scale: isActive ? size * 1.25 : size,
  };
}

// Get the marker color for a stop type
export function getMarkerColor(type: string): string {
  return getColors(type).bg;
}

// Type styles for consistency with card styling (matches marker colors)
export function getTypeStyles(type: string): string {
  switch (type) {
    case 'hike':
      return 'bg-pinesoft/20 text-pinesoft border-pinesoft/30';
    case 'camp':
      return 'bg-softamber/20 text-primary border-softamber/30';
    case 'viewpoint':
      return 'bg-skyblue/20 text-primary border-skyblue/30';
    case 'gas':
      return 'bg-blushorchid/20 text-primary border-blushorchid/30';
    default:
      return 'bg-lavenderslate/20 text-primary border-lavenderslate/30';
  }
}
