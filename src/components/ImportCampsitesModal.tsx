import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SpinnerGap,
  UploadSimple,
  File as FileIcon,
  CheckCircle,
  WarningCircle,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { useCampsites } from '@/context/CampsitesContext';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { CampsiteVisibility, ParsedImportLocation } from '@/types/campsite';
import { toast } from 'sonner';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

async function getStateFromCoords(lat: number, lng: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve(undefined);
      return;
    }
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        for (const result of results) {
          for (const component of result.address_components) {
            if (component.types.includes('administrative_area_level_1')) {
              resolve(component.short_name);
              return;
            }
          }
        }
      }
      resolve(undefined);
    });
  });
}

function extractCoords(text: string): { lat: number; lng: number } | null {
  if (!text) return null;

  const atMatch = text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  const qMatch = text.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  const placeMatch = text.match(/\/(place|search)\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeMatch) {
    const lat = parseFloat(placeMatch[2]);
    const lng = parseFloat(placeMatch[3]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  const coordMatch = text.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const parseRow = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else current += char;
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
      row[header.toLowerCase()] = values[index] || '';
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
    if (fileInputRef.current) fileInputRef.current.value = '';
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

      const firstRow = rows[0];
      if (!('Title' in firstRow) || !('URL' in firstRow)) {
        setParseError('Invalid CSV format. Expected columns: Title, URL');
        return;
      }

      const locations: ParsedImportLocation[] = [];
      const skipped: { title: string; reason: string }[] = [];
      let unnamedCount = 0;

      for (const row of rows) {
        const title = row.Title?.trim();
        const url = row.URL?.trim();
        const note = row.note?.trim();
        const comment = row.comment?.trim();
        const tagsRaw = row.tags?.trim();

        const tags = tagsRaw
          ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter((t) => t.length > 0)
          : undefined;

        let coords = extractCoords(url || '');
        if (!coords) coords = extractCoords(title || '');

        if (!coords) {
          skipped.push({ title: title || '(empty title)', reason: 'No coordinates' });
          continue;
        }

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
      setParseError('Failed to parse CSV. Please ensure it is a valid Google Takeout export.');
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setIsImporting(true);

    let locationsWithState = parsedData;
    if (googleMapsLoaded) {
      locationsWithState = await Promise.all(
        parsedData.map(async (location) => {
          const state = await getStateFromCoords(location.lat, location.lng);
          return { ...location, state };
        }),
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md border-line bg-white dark:bg-paper-2 rounded-[18px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <UploadSimple className="w-3.5 h-3.5" weight="regular" />
            Import places
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[20px] leading-[1.15] mt-1">
            Bring in your saved spots.
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Instructions */}
          <div className="px-3.5 py-3 rounded-[12px] border border-line bg-cream dark:bg-paper-2">
            <Mono className="text-ink-2 mb-1.5 block">From Google Maps</Mono>
            <ol className="space-y-1 text-[13px] text-ink-3 list-decimal list-inside">
              <li>
                Open{' '}
                <a
                  href="https://takeout.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pine-6 inline-flex items-center gap-0.5 hover:underline"
                >
                  Google Takeout <ArrowSquareOut className="w-3 h-3" weight="regular" />
                </a>
              </li>
              <li>Select "Saved" under Google Maps</li>
              <li>Download and extract the ZIP</li>
              <li>Upload the CSV below</li>
            </ol>
          </div>

          {/* File Upload */}
          <div className="space-y-1.5">
            <Mono className="text-ink-2 block">CSV file</Mono>
            <div
              className={cn(
                'border border-dashed rounded-[14px] p-6 text-center cursor-pointer transition-colors',
                selectedFile ? 'border-pine-6 bg-pine-6/[0.04]' : 'border-line hover:border-ink-3/40 hover:bg-cream dark:hover:bg-paper-2',
              )}
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
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] bg-pine-6 text-cream dark:text-ink-pine">
                    <FileIcon className="w-4 h-4" weight="regular" />
                  </div>
                  <span className="text-[14px] font-sans font-semibold text-ink truncate max-w-[260px]">
                    {selectedFile.name}
                  </span>
                </div>
              ) : (
                <>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-2.5">
                    <UploadSimple className="w-5 h-5" weight="regular" />
                  </div>
                  <p className="text-[13px] text-ink-3">Click to select a CSV file</p>
                </>
              )}
            </div>
          </div>

          {/* Errors */}
          {parseError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-[12px] border border-ember/30 bg-ember/[0.06]">
              <WarningCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-ember" weight="regular" />
              <p className="text-[13px] text-ember leading-[1.5]">{parseError}</p>
            </div>
          )}

          {parsedData && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-[12px] border border-pine-6/30 bg-pine-6/[0.06]">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-pine-6" weight="regular" />
              <p className="text-[13px] text-pine-6 leading-[1.5]">
                Found <span className="font-sans font-semibold">{parsedData.length}</span> locations ready to import
              </p>
            </div>
          )}

          {skippedEntries.length > 0 && (
            <div className="px-3 py-2.5 rounded-[12px] border border-clay/30 bg-clay/[0.06]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <WarningCircle className="w-3.5 h-3.5 text-clay" weight="regular" />
                <Mono className="text-clay">{skippedEntries.length} entries skipped</Mono>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {skippedEntries.map((entry, index) => (
                  <div
                    key={index}
                    className="flex justify-between text-[12px] text-ink-3"
                  >
                    <span className="truncate mr-2">{entry.title}</span>
                    <span className="text-clay flex-shrink-0">{entry.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visibility */}
          {parsedData && (
            <div className="space-y-1.5">
              <Mono className="text-ink-2 block">Visibility for imported campsites</Mono>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as CampsiteVisibility)}>
                <SelectTrigger className="h-10 rounded-[12px] border-line bg-white dark:bg-paper-2 text-ink text-[14px] hover:border-ink-3 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream dark:bg-paper-2 [&_[data-highlighted]]:text-ink">
                  <SelectItem value="private">Just me</SelectItem>
                  <SelectItem value="friends">Friends only</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[12px] text-ink-3">You can change visibility per campsite later.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3 border-t border-line">
            <Pill variant="ghost" mono={false} onClick={handleClose} className="!flex-1 !justify-center">
              Cancel
            </Pill>
            <Pill
              variant="solid-pine"
              mono={false}
              onClick={handleImport}
              className={cn(
                '!flex-1 !justify-center',
                (!parsedData || isImporting) && 'opacity-50 pointer-events-none',
              )}
            >
              {isImporting ? (
                <>
                  <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <UploadSimple className="w-3.5 h-3.5" weight="regular" />
                  Import {parsedData?.length || 0}
                </>
              )}
            </Pill>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
