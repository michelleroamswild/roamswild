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
import { CampsiteVisibility, GoogleTakeoutGeoJSON } from '@/types/campsite';
import { toast } from 'sonner';

interface ImportCampsitesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportCampsitesModal({ isOpen, onClose }: ImportCampsitesModalProps) {
  const { importFromGoogleTakeout } = useCampsites();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<GoogleTakeoutGeoJSON | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<CampsiteVisibility>('private');

  const resetState = () => {
    setSelectedFile(null);
    setParsedData(null);
    setParseError(null);
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

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Validate it looks like a GeoJSON with features
      if (!json.features || !Array.isArray(json.features)) {
        setParseError('Invalid format: Expected a GeoJSON file with "features" array');
        return;
      }

      // Count valid features (those with coordinates)
      const validFeatures = json.features.filter((f: { geometry?: { coordinates?: unknown[] } }) =>
        f.geometry?.coordinates && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2
      );

      if (validFeatures.length === 0) {
        setParseError('No valid locations found in the file');
        return;
      }

      setParsedData({
        type: 'FeatureCollection',
        features: validFeatures,
      });
    } catch {
      setParseError('Failed to parse JSON file. Please ensure it\'s a valid Google Takeout export.');
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setIsImporting(true);

    const importedCount = await importFromGoogleTakeout(parsedData, visibility);

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
      <DialogContent className="sm:max-w-md">
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
              <li>Upload the GeoJSON file below</li>
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
                accept=".json,.geojson"
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
                    Click to select a GeoJSON file
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
              <span>Found {parsedData.features.length} locations ready to import</span>
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
                `Import ${parsedData?.features.length || 0} Campsites`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
