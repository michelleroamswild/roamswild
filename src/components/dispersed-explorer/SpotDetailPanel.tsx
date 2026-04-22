import {
  ArrowLeft,
  ArrowSquareOut,
  Car,
  Check,
  CheckCircle,
  Copy,
  Crosshair,
  Jeep,
  Lightning,
  MapPinLine,
  Path,
  SpinnerGap,
  Tent,
  TreeEvergreen,
  Users,
  Warning,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { PotentialSpot } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';
import type { SpotAIAnalysis } from './types';

interface SpotDetailPanelProps {
  selectedSpot: PotentialSpot;
  existingCampsiteForSpot: Campsite | null;
  aiAnalysis: SpotAIAnalysis | null;
  aiAnalyzing: boolean;
  aiError: string | null;
  copiedCoords: boolean;
  onBack: () => void;
  onCopyCoords: () => void;
  onAnalyze: () => void;
  onReanalyze: () => void;
  onDismissError: () => void;
  onConfirm: () => void;
}

const typeLabel = (type: PotentialSpot['type']) => {
  if (type === 'camp-site') return 'Known Campsite';
  if (type === 'dead-end') return 'Road Terminus';
  return 'Road Junction';
};

export const SpotDetailPanel = ({
  selectedSpot,
  existingCampsiteForSpot,
  aiAnalysis,
  aiAnalyzing,
  aiError,
  copiedCoords,
  onBack,
  onCopyCoords,
  onAnalyze,
  onReanalyze,
  onDismissError,
  onConfirm,
}: SpotDetailPanelProps) => {
  const TypeIcon = selectedSpot.type === 'camp-site' ? Tent : selectedSpot.type === 'dead-end' ? MapPinLine : Path;
  const typeColor = selectedSpot.type === 'camp-site' ? 'text-wildviolet bg-wildviolet/10' : selectedSpot.type === 'dead-end' ? 'text-orange-600 bg-orange-500/10' : 'text-blue-600 bg-blue-500/10';

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to results
      </button>

      {/* Hero header */}
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${typeColor}`}>
          <TypeIcon className="w-6 h-6" weight={selectedSpot.type === 'dead-end' ? 'fill' : 'regular'} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold leading-tight text-foreground">{selectedSpot.name || 'Unnamed Spot'}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {typeLabel(selectedSpot.type)}
            </span>
            <span className="text-xs text-muted-foreground">
              Score <span className="font-semibold text-foreground">{selectedSpot.score}</span>/50
            </span>
          </div>
        </div>
      </div>

      {/* Coords bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 rounded-lg border border-border">
        <span className="text-xs font-mono text-muted-foreground truncate">
          {selectedSpot.lat.toFixed(5)}, {selectedSpot.lng.toFixed(5)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onCopyCoords}
            className="p-1.5 rounded hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
            title="Copy coordinates"
          >
            {copiedCoords ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selectedSpot.lat},${selectedSpot.lng}`, '_blank')}
            className="p-1.5 rounded hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
            title="Open in Google Maps"
          >
            <ArrowSquareOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick meta tags */}
      {(selectedSpot.isOnMVUMRoad || selectedSpot.isOnBLMRoad || selectedSpot.isOnPublicLand || selectedSpot.passengerReachable || selectedSpot.highClearanceReachable || selectedSpot.roadName) && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSpot.isOnMVUMRoad && <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-md text-xs font-medium">USFS MVUM</span>}
          {selectedSpot.isOnBLMRoad && <span className="px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-md text-xs font-medium">BLM</span>}
          {selectedSpot.isOnPublicLand && !selectedSpot.isOnMVUMRoad && !selectedSpot.isOnBLMRoad && <span className="px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-md text-xs font-medium">Public Land</span>}
          {selectedSpot.passengerReachable && <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-md text-xs font-medium flex items-center gap-1"><Car className="w-3 h-3" /> Passenger</span>}
          {selectedSpot.highClearanceReachable && !selectedSpot.passengerReachable && <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-md text-xs font-medium flex items-center gap-1"><Jeep className="w-3 h-3" /> High Clearance</span>}
          {selectedSpot.roadName && <span className="px-2 py-1 bg-muted text-muted-foreground rounded-md text-xs">{selectedSpot.roadName}</span>}
        </div>
      )}

      {/* Reasons */}
      {selectedSpot.reasons.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Why it's promising</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedSpot.reasons.map((reason, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">{reason}</span>
            ))}
          </div>
        </div>
      )}

      {/* Community confirmations */}
      {existingCampsiteForSpot && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 text-green-700 dark:text-green-300 rounded-lg border border-green-500/20">
          <Users className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">{existingCampsiteForSpot.confirmationCount} confirmed</span>
          {existingCampsiteForSpot.isConfirmed && (
            <span className="flex items-center gap-1 text-xs ml-auto">
              <CheckCircle className="w-3.5 h-3.5" /> Verified
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" disabled={aiAnalyzing} onClick={onAnalyze}>
          {aiAnalyzing ? <SpinnerGap className="w-4 h-4 animate-spin mr-1.5" /> : <Lightning className="w-4 h-4 mr-1.5" weight="fill" />}
          {aiAnalysis ? 'Analyzed' : aiAnalyzing ? 'Analyzing...' : 'Analyze'}
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm}>
          <CheckCircle className="w-4 h-4 mr-1.5" />
          {existingCampsiteForSpot ? 'Confirmed' : 'Confirm'}
        </Button>
      </div>

      {/* AI Analysis */}
      {(aiAnalysis || aiAnalyzing || aiError) && (
        <div className="pt-3 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">AI Assessment</p>

          {aiAnalyzing && !aiAnalysis && (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <SpinnerGap className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">Analyzing satellite imagery...</span>
            </div>
          )}

          {aiError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{aiError}</p>
              <Button variant="outline" size="sm" className="w-full" onClick={onDismissError}>Retry</Button>
            </div>
          )}

          {aiAnalysis && (
            <div className="space-y-3">
              {/* Big score card */}
              <div className={`p-4 rounded-xl border-2 ${
                aiAnalysis.campabilityScore >= 70 ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-700' :
                  aiAnalysis.campabilityScore >= 50 ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 dark:border-amber-700' :
                    aiAnalysis.campabilityScore >= 30 ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 dark:border-orange-700' :
                      'border-red-300 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 dark:border-red-700'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl shrink-0 ${
                    aiAnalysis.campabilityScore >= 70 ? 'bg-green-500' : aiAnalysis.campabilityScore >= 50 ? 'bg-amber-500' : aiAnalysis.campabilityScore >= 30 ? 'bg-orange-500' : 'bg-red-500'
                  }`}>{aiAnalysis.campabilityScore}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">
                      {aiAnalysis.campabilityScore >= 70 ? 'Great Campsite' : aiAnalysis.campabilityScore >= 50 ? 'Decent Spot' : aiAnalysis.campabilityScore >= 30 ? 'Marginal' : 'Not Recommended'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{aiAnalysis.confidence} confidence</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed mt-3">{aiAnalysis.summary}</p>
              </div>

              {/* Factor grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Ground', icon: <Crosshair className="w-3.5 h-3.5" />, data: aiAnalysis.ground },
                  { label: 'Access', icon: <Path className="w-3.5 h-3.5" />, data: aiAnalysis.access },
                  { label: 'Cover', icon: <TreeEvergreen className="w-3.5 h-3.5" />, data: aiAnalysis.cover },
                  { label: 'Hazards', icon: <Warning className="w-3.5 h-3.5" />, data: aiAnalysis.hazards },
                ].map(({ label, icon, data }) => (
                  <div key={label} className={`p-2.5 rounded-lg ${
                    data.rating === 'good' || data.rating === 'none' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' :
                      data.rating === 'fair' || data.rating === 'minor' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                        data.rating === 'poor' || data.rating === 'moderate' || data.rating === 'significant' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                          'bg-muted text-muted-foreground'
                  }`}>
                    <div className="flex items-center gap-1 mb-1">
                      {icon}
                      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                      <span className="text-[10px] font-medium ml-auto capitalize opacity-70">{data.rating}</span>
                    </div>
                    <p className="text-xs leading-snug">{data.detail}</p>
                  </div>
                ))}
              </div>

              {/* Trail */}
              {aiAnalysis.trail && (
                <div className={`p-2.5 rounded-lg ${
                  aiAnalysis.trail.rating === 'easy' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' :
                    aiAnalysis.trail.rating === 'moderate' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                      aiAnalysis.trail.rating === 'difficult' || aiAnalysis.trail.rating === 'extreme' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                        'bg-muted text-muted-foreground'
                }`}>
                  <div className="flex items-center gap-1 mb-1">
                    <Path className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Trail</span>
                    <span className="text-[10px] font-medium ml-auto capitalize opacity-70">{aiAnalysis.trail.rating}</span>
                  </div>
                  <p className="text-xs leading-snug">{aiAnalysis.trail.detail}</p>
                </div>
              )}

              {/* Best use */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-primary/5 rounded-lg border border-primary/10">
                <Tent className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-medium">{aiAnalysis.bestUse}</p>
              </div>

              <Button variant="ghost" size="sm" className="w-full" onClick={onReanalyze}>Re-analyze</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
