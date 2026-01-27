import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SpinnerGap, UploadSimple, File, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useCampsites } from '@/context/CampsitesContext';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { CampsiteVisibility, ParsedImportLocation } from '@/types/campsite';
import { toast } from 'sonner';

// Reverse geocode to get state from coordinates
async function getStateFromCoords(lat: number, lng: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve(undefined);
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat, lng } },
      (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          // Look for administrative_area_level_1 (state)
          for (const result of results) {
            for (const component of result.address_components) {
              if (component.types.includes('administrative_area_level_1')) {
                resolve(component.short_name); // e.g., "CA", "UT", "NV"
                return;
              }
            }
          }
        }
        resolve(undefined);
      }
    );
  });
}

// Extract lat/lng from a string (URL or text)
function extractCoords(text: string): { lat: number; lng: number } | null {
  if (!text) return null;

  // Pattern 1: /@lat,lng,zoom (e.g., /@37.7749,-122.4194,15z)
  const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const atMatch = text.match(atPattern);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // Pattern 2: ?q=lat,lng or &q=lat,lng
  const qPattern = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const qMatch = text.match(qPattern);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // Pattern 3: /place/lat,lng or /search/lat,lng
  const placePattern = /\/(place|search)\/(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const placeMatch = text.match(placePattern);
  if (placeMatch) {
    const lat = parseFloat(placeMatch[2]);
    const lng = parseFloat(placeMatch[3]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // Pattern 4: Standalone coordinates like "37.7749, -122.4194" or "37.7749,-122.4194"
  const coordPattern = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
  const coordMatch = text.match(coordPattern);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

// Parse CSV/TSV text into rows (handles both comma and tab delimiters)
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  // Detect delimiter (tab or comma) from first line
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  // Parse row - handle quoted values
  const parseRow = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseRow(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      // Store with lowercase key for consistent access
      row[header.toLowerCase()] = values[index] || '';
      // Also store original for backwards compatibility
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

interface ImportCampsitesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportCampsitesModal({ isOpen, onClose }: ImportCampsitesModalProps) {
  const { importFromCSV } = useCampsites();
  const { isLoaded: googleMapsLoaded } = useGoogleMaps();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedImportLocation[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skippedEntries, setSkippedEntries] = useState<{ title: string; reason: string }[]>([]);
  const [visibility, setVisibility] = useState<CampsiteVisibility>('private');

  const resetState = () => {
    setSelectedFile(null);
    setParsedData(null);
    setParseError(null);
    setSkippedEntries([]);
    setVisibility('private');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setParsedData(null);
    setSkippedEntries([]);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        setParseError('No data found in the CSV file');
        return;
      }

      // Check for required columns
      const firstRow = rows[0];
      if (!('Title' in firstRow) || !('URL' in firstRow)) {
        setParseError('Invalid CSV format. Expected columns: Title, URL');
        return;
      }

      // Parse each row and extract coordinates from URL
      const locations: ParsedImportLocation[] = [];
      const skipped: { title: string; reason: string }[] = [];

      let unnamedCount = 0;
      for (const row of rows) {
        const title = row.Title?.trim();
        const url = row.URL?.trim();
        const note = row.note?.trim();
        const comment = row.comment?.trim();
        const tagsRaw = row.tags?.trim();

        // Parse tags - split by semicolon or comma and clean up
        const tags = tagsRaw
          ? tagsRaw.split(/[;,]/).map(t => t.trim()).filter(t => t.length > 0)
          : undefined;

        // Try URL first, then fall back to title for coordinates
        let coords = extractCoords(url || '');
        if (!coords) {
          coords = extractCoords(title || '');
        }

        if (!coords) {
          skipped.push({ title: title || '(empty title)', reason: 'No coordinates found' });
          continue;
        }

        // Use title or generate a default name
        let name = title;
        if (!name) {
          unnamedCount++;
          name = `Imported Campsite ${unnamedCount}`;
        }

        locations.push({
          name,
          lat: coords.lat,
          lng: coords.lng,
          note: note || undefined,
          comment: comment || undefined,
          url: url || undefined,
          tags: tags && tags.length > 0 ? tags : undefined,
        });
      }

      setSkippedEntries(skipped);

      if (locations.length === 0) {
        setParseError('No valid locations found. Could not extract coordinates from any URLs.');
        return;
      }

      setParsedData(locations);
    } catch {
      setParseError('Failed to parse CSV file. Please ensure it\'s a valid Google Takeout export.');
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setIsImporting(true);

    // Fetch states for each location if Google Maps is loaded
    let locationsWithState = parsedData;
    if (googleMapsLoaded) {
      locationsWithState = await Promise.all(
        parsedData.map(async (location) => {
          const state = await getStateFromCoords(location.lat, location.lng);
          return { ...location, state };
        })
      );
    }

    const importedCount = await importFromCSV(locationsWithState, visibility);

    setIsImporting(false);

    if (importedCount > 0) {
      toast.success(`Imported ${importedCount} campsites`);
      handleClose();
    } else {
      toast.error('No campsites were imported');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadSimple className="w-5 h-5 text-primary" />
            Import from Google
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Instructions */}
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Import your saved places from Google Maps:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Go to <a href="https://takeout.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Takeout</a></li>
              <li>Select "Saved" under Google Maps</li>
              <li>Download and extract the ZIP file</li>
              <li>Upload the CSV file below</li>
            </ol>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Select File</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                selectedFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <File className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">{selectedFile.name}</span>
                </div>
              ) : (
                <div>
                  <UploadSimple className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to select a CSV file
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Parse Result */}
          {parseError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <WarningCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {parsedData && (
            <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg text-primary text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Found {parsedData.length} locations ready to import</span>
            </div>
          )}

          {skippedEntries.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
              <div className="flex items-center gap-2 text-amber-600 font-medium mb-2">
                <WarningCircle className="w-4 h-4" />
                <span>{skippedEntries.length} entries will be skipped</span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {skippedEntries.map((entry, index) => (
                  <div key={index} className="text-xs text-muted-foreground flex justify-between">
                    <span className="truncate mr-2">{entry.title}</span>
                    <span className="text-amber-600 flex-shrink-0">{entry.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visibility Selection */}
          {parsedData && (
            <div className="space-y-2">
              <Label>Visibility for imported campsites</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as CampsiteVisibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (just me)</SelectItem>
                  <SelectItem value="friends">Friends only</SelectItem>
                  <SelectItem value="public">Public (everyone)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                You can change visibility for individual campsites later
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={!parsedData || isImporting}
            >
              {isImporting ? (
                <>
                  <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${parsedData?.length || 0} Campsites`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
