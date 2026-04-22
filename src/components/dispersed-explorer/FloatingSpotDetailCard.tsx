import {
  Car,
  Check,
  CheckCircle,
  Copy,
  Crosshair,
  Jeep,
  Lightning,
  MapPin,
  MapPinLine,
  Path,
  SpinnerGap,
  Tent,
  TreeEvergreen,
  Users,
  Warning,
  X,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { PotentialSpot } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';

export interface SpotAIAnalysis {
  campabilityScore: number;
  summary: string;
  ground: { rating: string; detail: string };
  access: { rating: string; detail: string };
  cover: { rating: string; detail: string };
  hazards: { rating: string; detail: string };
  trail: { rating: string; detail: string } | null;
  bestUse: string;
  confidence: string;
  confidenceNote?: string;
}

interface FloatingSpotDetailCardProps {
  selectedSpot: PotentialSpot;
  existingCampsiteForSpot: Campsite | null;
  aiAnalysis: SpotAIAnalysis | null;
  aiAnalyzing: boolean;
  aiError: string | null;
  copiedCoords: boolean;
  onClose: () => void;
  onCopyCoords: () => void;
  onAnalyze: () => void;
  onReanalyze: () => void;
  onDismissError: () => void;
  onConfirm: () => void;
}

export const FloatingSpotDetailCard = ({
  selectedSpot,
  existingCampsiteForSpot,
  aiAnalysis,
  aiAnalyzing,
  aiError,
  copiedCoords,
  onClose,
  onCopyCoords,
  onAnalyze,
  onReanalyze,
  onDismissError,
  onConfirm,
}: FloatingSpotDetailCardProps) => {
  return (
    <div className="absolute top-3 right-3 w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto bg-background border border-border rounded-xl shadow-2xl z-20">
      {/* Header */}
      <div className="sticky top-0 bg-background border-b px-3 py-2.5 flex items-start justify-between rounded-t-xl">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {selectedSpot.type === 'camp-site' ? (
              <Tent className="w-4 h-4 text-wildviolet shrink-0" />
            ) : selectedSpot.type === 'dead-end' ? (
              <MapPinLine className="w-4 h-4 text-orange-600 shrink-0" weight="fill" />
            ) : (
              <Path className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <h3 className="font-bold text-sm truncate">{selectedSpot.name || 'Unnamed Spot'}</h3>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {selectedSpot.type === 'camp-site' ? 'Known Campsite' :
                selectedSpot.type === 'dead-end' ? 'Road Terminus' : 'Road Junction'}
            </span>
            <span className="text-xs text-muted-foreground">Score: {selectedSpot.score}/50</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Spot Info */}
      <div className="px-3 py-2.5 space-y-2.5 border-b">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">{selectedSpot.lat.toFixed(5)}, {selectedSpot.lng.toFixed(5)}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selectedSpot.lat},${selectedSpot.lng}`, '_blank')} className="text-muted-foreground hover:text-foreground transition-colors" title="Open in Google Maps">
              <MapPin className="w-3.5 h-3.5" weight="fill" />
            </button>
            <button onClick={onCopyCoords} className="text-muted-foreground hover:text-foreground transition-colors" title="Copy coordinates">
              {copiedCoords ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {selectedSpot.isOnMVUMRoad && <span className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full text-[10px] font-medium">USFS MVUM</span>}
          {selectedSpot.isOnBLMRoad && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-[10px] font-medium">BLM</span>}
          {selectedSpot.isOnPublicLand && !selectedSpot.isOnMVUMRoad && !selectedSpot.isOnBLMRoad && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full text-[10px] font-medium">Public Land</span>}
          {selectedSpot.passengerReachable && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-[10px] font-medium flex items-center gap-0.5"><Car className="w-3 h-3" /> Passenger</span>}
          {selectedSpot.highClearanceReachable && !selectedSpot.passengerReachable && <span className="px-2 py-0.5 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-full text-[10px] font-medium flex items-center gap-0.5"><Jeep className="w-3 h-3" /> High Clearance</span>}
          {selectedSpot.roadName && <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-[10px]">{selectedSpot.roadName}</span>}
        </div>
        {selectedSpot.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedSpot.reasons.map((reason, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{reason}</span>)}
          </div>
        )}
        {existingCampsiteForSpot && (
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{existingCampsiteForSpot.confirmationCount} confirmed</span>
            {existingCampsiteForSpot.isConfirmed && <span className="flex items-center gap-0.5 text-[10px]"><CheckCircle className="w-3 h-3" /> Verified</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-b">
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7" disabled={aiAnalyzing} onClick={onAnalyze}>
            {aiAnalyzing ? <SpinnerGap className="w-3 h-3 animate-spin mr-1" /> : <Lightning className="w-3 h-3 mr-1" weight="fill" />}
            {aiAnalysis ? 'Analyzed' : aiAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
          <Button variant="default" size="sm" className="flex-1 text-[10px] h-7" onClick={onConfirm}>
            <CheckCircle className="w-3 h-3 mr-1" />
            {existingCampsiteForSpot ? 'Confirmed' : 'Confirm'}
          </Button>
        </div>
      </div>

      {/* AI Analysis Results */}
      <div className="px-3 py-2.5">
        {!aiAnalysis && !aiAnalyzing && !aiError && <p className="text-[10px] text-muted-foreground text-center">Tap Analyze to get an AI assessment of this spot</p>}
        {aiAnalyzing && !aiAnalysis && (
          <div className="flex flex-col items-center py-3 text-muted-foreground">
            <SpinnerGap className="w-5 h-5 animate-spin mb-1.5" />
            <span className="text-xs font-medium">Analyzing satellite imagery...</span>
          </div>
        )}
        {aiError && (
          <div className="space-y-1.5">
            <p className="text-xs text-destructive">{aiError}</p>
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={onDismissError}>Retry</Button>
          </div>
        )}
        {aiAnalysis && (
          <div className="space-y-2.5">
            <div className={`p-3 rounded-xl border-2 ${
              aiAnalysis.campabilityScore >= 70 ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-700' :
                aiAnalysis.campabilityScore >= 50 ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 dark:border-amber-700' :
                  aiAnalysis.campabilityScore >= 30 ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 dark:border-orange-700' :
                    'border-red-300 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 dark:border-red-700'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${
                  aiAnalysis.campabilityScore >= 70 ? 'bg-green-500' : aiAnalysis.campabilityScore >= 50 ? 'bg-amber-500' : aiAnalysis.campabilityScore >= 30 ? 'bg-orange-500' : 'bg-red-500'
                }`}>{aiAnalysis.campabilityScore}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{aiAnalysis.campabilityScore >= 70 ? 'Great Campsite' : aiAnalysis.campabilityScore >= 50 ? 'Decent Spot' : aiAnalysis.campabilityScore >= 30 ? 'Marginal' : 'Not Recommended'}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">AI Assessment • {aiAnalysis.confidence} confidence</p>
                </div>
              </div>
              <p className="text-xs leading-relaxed mt-2">{aiAnalysis.summary}</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Ground', icon: <Crosshair className="w-3 h-3" />, data: aiAnalysis.ground },
                { label: 'Access', icon: <Path className="w-3 h-3" />, data: aiAnalysis.access },
                { label: 'Cover', icon: <TreeEvergreen className="w-3 h-3" />, data: aiAnalysis.cover },
                { label: 'Hazards', icon: <Warning className="w-3 h-3" />, data: aiAnalysis.hazards },
              ].map(({ label, icon, data }) => (
                <div key={label} className={`p-2 rounded-lg ${
                  data.rating === 'good' || data.rating === 'none' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' :
                    data.rating === 'fair' || data.rating === 'minor' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                      data.rating === 'poor' || data.rating === 'moderate' || data.rating === 'significant' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                        'bg-muted text-muted-foreground'
                }`}>
                  <div className="flex items-center gap-1 mb-0.5">{icon}<span className="text-[10px] font-semibold uppercase">{label}</span></div>
                  <p className="text-[10px] leading-snug">{data.detail}</p>
                </div>
              ))}
            </div>
            {aiAnalysis.trail && (
              <div className={`p-2 rounded-lg ${
                aiAnalysis.trail.rating === 'easy' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' :
                  aiAnalysis.trail.rating === 'moderate' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                    aiAnalysis.trail.rating === 'difficult' || aiAnalysis.trail.rating === 'extreme' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                      'bg-muted text-muted-foreground'
              }`}>
                <div className="flex items-center gap-1 mb-0.5"><Path className="w-3 h-3" /><span className="text-[10px] font-semibold uppercase">Trail</span><span className="text-[10px] font-medium ml-auto capitalize">{aiAnalysis.trail.rating}</span></div>
                <p className="text-[10px] leading-snug">{aiAnalysis.trail.detail}</p>
              </div>
            )}
            <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/5 rounded-lg">
              <Tent className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs font-medium">{aiAnalysis.bestUse}</p>
            </div>
            <Button variant="ghost" size="sm" className="w-full text-[10px] h-6" onClick={onReanalyze}>Re-analyze</Button>
          </div>
        )}
      </div>
    </div>
  );
};
