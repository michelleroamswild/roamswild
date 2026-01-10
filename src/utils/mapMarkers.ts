// Consistent map marker icons that match the stop card icons
// Using SVG versions of lucide icons: Footprints (hike), Tent (camp), Eye (viewpoint), Fuel (gas), MapPin (default)

const MARKER_COLORS = {
  hike: { bg: '#10b981', text: '#ffffff' },      // emerald-500
  camp: { bg: '#f59e0b', text: '#ffffff' },      // amber-500
  viewpoint: { bg: '#2d5a3d', text: '#ffffff' }, // primary forest green
  gas: { bg: '#c2410c', text: '#ffffff' },       // terracotta/orange
  start: { bg: '#2d5a3d', text: '#ffffff' },     // primary forest green
  default: { bg: '#6b7280', text: '#ffffff' },   // gray-500
};

// Footprints icon SVG path (for hikes)
const footprintsPath = `
  <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M16 17h4M4 13h4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
`;

// Tent icon SVG path (for camping)
const tentPath = `
  <path d="M12 5L4 19h16L12 5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
  <path d="M12 5v14M9 19l3-7 3 7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
`;

// Eye icon SVG path (for viewpoints)
const eyePath = `
  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
`;

// Fuel icon SVG path (for gas stations)
const fuelPath = `
  <path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <path d="M3 22h12M6 10h6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M15 8h2a2 2 0 0 1 2 2v6a1 1 0 0 0 1 1 1 1 0 0 0 1-1V9.5a.5.5 0 0 0-.5-.5h-1" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <path d="M18 4l2 2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
`;

// MapPin icon SVG path (default)
const mapPinPath = `
  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
`;

// Flag icon for start location
const flagPath = `
  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.3"/>
  <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="1.5"/>
`;

function getIconPath(type: string): string {
  switch (type) {
    case 'hike':
      return footprintsPath;
    case 'camp':
      return tentPath;
    case 'viewpoint':
      return eyePath;
    case 'gas':
      return fuelPath;
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
      <!-- Icon -->
      <g transform="translate(6, 6)" style="color: ${colors.text}">
        ${getIconPath(type)}
      </g>
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
