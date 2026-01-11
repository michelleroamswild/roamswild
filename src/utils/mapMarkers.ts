// Consistent map marker icons that match the stop card icons
// Using SVG icons: Boot (hike), Tent (camp), Eye (viewpoint), GasPump (gas), MapPin (default)

const MARKER_COLORS = {
  hike: { bg: '#10b981', text: '#ffffff' },      // emerald-500
  camp: { bg: '#f59e0b', text: '#ffffff' },      // amber-500
  viewpoint: { bg: '#2d5a3d', text: '#ffffff' }, // primary forest green
  gas: { bg: '#c2410c', text: '#ffffff' },       // terracotta/orange
  start: { bg: '#2d5a3d', text: '#ffffff' },     // primary forest green
  default: { bg: '#6b7280', text: '#ffffff' },   // gray-500
};

// All Phosphor icon paths use 256x256 viewBox - they get scaled to 20px in createMarkerIcon

// Boot icon - Phosphor regular weight (256x256 viewBox)
const bootPath = `M192,112H160V56a16,16,0,0,0-16-16H32a8,8,0,0,0-7.47,10.86c11.06,28.84,8.76,83.71-.22,114.93A8.25,8.25,0,0,0,24,168v32a16,16,0,0,0,16,16H66.11a16,16,0,0,0,7.16-1.69L85.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69h28.22a16,16,0,0,0,7.16-1.69L169.89,208h16.22l12.62,6.31a16,16,0,0,0,7.16,1.69H232a16,16,0,0,0,16-16V168A56.06,56.06,0,0,0,192,112ZM42.86,56H144V80H112a8,8,0,0,0,0,16h32v16H112a8,8,0,0,0,0,16h80a40.07,40.07,0,0,1,39.2,32H42.25C49,129.16,50.41,85.83,42.86,56ZM232,200H205.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H169.89a16,16,0,0,0-7.16,1.69L150.11,200H121.89l-12.62-6.31a16,16,0,0,0-7.16-1.69H85.89a16,16,0,0,0-7.16,1.69L66.11,200H40V176H232Z`;

// Tent icon - Phosphor regular weight (256x256 viewBox)
const tentPath = `M255.31,188.75l-64-144A8,8,0,0,0,184,40H72a8,8,0,0,0-7.27,4.69.21.21,0,0,0,0,.06l0,.12,0,0L.69,188.75A8,8,0,0,0,8,200H248a8,8,0,0,0,7.31-11.25ZM64,184H20.31L64,85.7Zm16,0V85.7L123.69,184Zm61.2,0L84.31,56H178.8l56.89,128Z`;

// Eye icon - Phosphor regular weight (256x256 viewBox)
const eyePath = `M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z`;

// GasPump icon - Phosphor regular weight (256x256 viewBox)
const gasPumpPath = `M241,69.66,221.66,50.34a8,8,0,0,0-11.32,11.32L229.66,81A8,8,0,0,1,232,86.63V168a8,8,0,0,1-16,0V128a24,24,0,0,0-24-24H176V56a24,24,0,0,0-24-24H72A24,24,0,0,0,48,56V208H32a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16H176V120h16a8,8,0,0,1,8,8v40a24,24,0,0,0,48,0V86.63A23.85,23.85,0,0,0,241,69.66ZM64,56a8,8,0,0,1,8-8h80a8,8,0,0,1,8,8v72H64Zm0,152V144h96v64Z`;

// MapPin icon - Phosphor regular weight (256x256 viewBox)
const mapPinPath = `M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z`;

// Flag icon - Phosphor regular weight (256x256 viewBox)
const flagPath = `M42.76,50A8,8,0,0,0,40,56V224a8,8,0,0,0,16,0V179.77c26.79-21.16,49.87-9.75,76.45,3.41,16.4,8.11,34.06,16.85,53,16.85,13.93,0,28.54-4.75,43.82-18a8,8,0,0,0,2.76-6V56A8,8,0,0,0,218.76,50c-28,24.23-51.72,12.49-79.21-1.12C111.07,34.76,78.78,18.79,42.76,50ZM216,172.25c-26.79,21.16-49.87,9.74-76.45-3.41-25-12.35-52.81-26.13-83.55-8.4V59.79c26.79-21.16,49.87-9.75,76.45,3.4,25,12.35,52.82,26.13,83.55,8.4Z`;

function getIconPath(type: string): string {
  switch (type) {
    case 'hike':
      return bootPath;
    case 'camp':
      return tentPath;
    case 'viewpoint':
      return eyePath;
    case 'gas':
      return gasPumpPath;
    case 'start':
      return flagPath;
    default:
      return mapPinPath;
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
  const strokeWidth = isActive ? 3 : 2;
  const strokeColor = isActive ? '#000000' : '#ffffff';
  const actualSize = isActive ? size * 1.2 : size;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}" viewBox="0 0 36 36">
      <!-- Background circle -->
      <circle cx="18" cy="18" r="16" fill="${colors.bg}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
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
    strokeColor: isActive ? '#000000' : '#ffffff',
    strokeWeight: isActive ? 3 : 2,
    scale: isActive ? size * 1.25 : size,
  };
}

// Get the marker color for a stop type
export function getMarkerColor(type: string): string {
  return getColors(type).bg;
}

// Type styles for consistency with card styling
export function getTypeStyles(type: string): string {
  switch (type) {
    case 'hike':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'gas':
      return 'bg-terracotta/10 text-terracotta border-terracotta/20';
    case 'camp':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'viewpoint':
      return 'bg-primary/10 text-primary border-primary/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}
