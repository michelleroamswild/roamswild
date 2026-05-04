import { Crosshair, Path, Sparkle, SpinnerGap, Tent, TreeEvergreen, Warning } from '@phosphor-icons/react';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';
import { DetailSection } from './DetailPanelChrome';
import type { SpotAIAnalysis } from './types';

// Score-tier ramp (campability score → severity accent + label).
const SCORE_TIERS = [
  { min: 70, label: 'Great campsite',   bg: 'bg-pin-safe/[0.10]',     border: 'border-pin-safe/40',     pill: 'bg-pin-safe' },
  { min: 50, label: 'Decent spot',      bg: 'bg-pin-easy/[0.10]',     border: 'border-pin-easy/40',     pill: 'bg-pin-easy' },
  { min: 30, label: 'Marginal',         bg: 'bg-pin-moderate/[0.10]', border: 'border-pin-moderate/40', pill: 'bg-pin-moderate' },
  { min: 0,  label: 'Not recommended',  bg: 'bg-ember/[0.08]',        border: 'border-ember/40',        pill: 'bg-ember' },
];

const AiScoreCard = ({ analysis }: { analysis: SpotAIAnalysis }) => {
  const tier = SCORE_TIERS.find((t) => analysis.campabilityScore >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1];
  return (
    <div className={cn('p-4 rounded-[12px] border', tier.bg, tier.border)}>
      <div className="flex items-center gap-3">
        <div className={cn('w-14 h-14 rounded-[10px] flex items-center justify-center text-cream font-sans font-bold text-[22px] tracking-[-0.02em] flex-shrink-0', tier.pill)}>
          {analysis.campabilityScore}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">{tier.label}</p>
          <Mono className="text-ink-3 block mt-0.5">{analysis.confidence} confidence</Mono>
        </div>
      </div>
      <p className="text-[13px] text-ink leading-[1.55] mt-3">{analysis.summary}</p>
    </div>
  );
};

type FactorRating = string;
type FactorData = { rating: FactorRating; detail: string };

const ratingAccent = (rating: FactorRating): { bg: string; text: string } => {
  if (['good', 'none', 'easy'].includes(rating))             return { bg: 'bg-pin-safe/15',     text: 'text-pin-safe' };
  if (['fair', 'minor', 'moderate'].includes(rating))        return { bg: 'bg-pin-easy/15',     text: 'text-pin-easy' };
  if (['poor', 'significant', 'difficult'].includes(rating)) return { bg: 'bg-pin-moderate/15', text: 'text-pin-moderate' };
  if (['extreme'].includes(rating))                          return { bg: 'bg-ember/15',        text: 'text-ember' };
  return                                                            { bg: 'bg-paper-2',         text: 'text-ink-3' };
};

const FactorTile = ({
  label,
  Icon,
  data,
}: {
  label: string;
  Icon: typeof Path;
  data: FactorData;
}) => {
  const { bg, text } = ratingAccent(data.rating);
  return (
    <div className={cn('p-2.5 rounded-[10px]', bg)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', text)} weight="regular" />
        <Mono className={text}>{label}</Mono>
        <Mono className={cn('ml-auto opacity-70', text)}>{data.rating}</Mono>
      </div>
      <p className={cn('text-[12px] leading-snug', text)}>{data.detail}</p>
    </div>
  );
};

interface AiAssessmentSectionProps {
  aiAnalysis: SpotAIAnalysis | null;
  aiAnalyzing: boolean;
  aiCheckingCache: boolean;
  aiError: string | null;
  onAnalyze: () => void;
  onReanalyze: () => void;
  onDismissError: () => void;
}

export const AiAssessmentSection = ({
  aiAnalysis,
  aiAnalyzing,
  aiCheckingCache,
  aiError,
  onAnalyze,
  onReanalyze,
  onDismissError,
}: AiAssessmentSectionProps) => (
  <DetailSection title="AI assessment">
    {aiCheckingCache && !aiAnalysis && (
      <div className="flex items-center gap-2 py-2 text-ink-3">
        <SpinnerGap className="w-4 h-4 animate-spin" />
        <span className="text-[13px]">Checking for cached analysis…</span>
      </div>
    )}

    {!aiCheckingCache && !aiAnalysis && !aiAnalyzing && !aiError && (
      <div className="space-y-3">
        <p className="text-[13px] text-ink-3 leading-[1.55]">
          Get an AI-powered assessment of this spot's campability from satellite imagery.
        </p>
        <Pill variant="solid-pine" mono={false} onClick={onAnalyze} className="!w-full !justify-center">
          <Sparkle className="w-4 h-4" weight="fill" />
          Analyze
        </Pill>
      </div>
    )}

    {aiAnalyzing && !aiAnalysis && (
      <div className="flex flex-col items-center py-5 gap-2">
        <SpinnerGap className="w-5 h-5 animate-spin text-pine-6" />
        <Mono className="text-pine-6">Analyzing satellite imagery…</Mono>
      </div>
    )}

    {aiError && (
      <div className="space-y-2">
        <p className="text-[13px] text-ember">{aiError}</p>
        <Pill variant="ghost" sm mono={false} onClick={onDismissError} className="!w-full !justify-center">
          Retry
        </Pill>
      </div>
    )}

    {aiAnalysis && (
      <div className="space-y-3">
        <AiScoreCard analysis={aiAnalysis} />
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Ground',  Icon: Crosshair,    data: aiAnalysis.ground },
            { label: 'Access',  Icon: Path,         data: aiAnalysis.access },
            { label: 'Cover',   Icon: TreeEvergreen, data: aiAnalysis.cover },
            { label: 'Hazards', Icon: Warning,      data: aiAnalysis.hazards },
          ].map(({ label, Icon: FIcon, data }) => (
            <FactorTile key={label} label={label} Icon={FIcon} data={data} />
          ))}
        </div>
        {aiAnalysis.trail && (
          <FactorTile label="Trail" Icon={Path} data={aiAnalysis.trail} />
        )}
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border border-pine-6/30 bg-pine-6/[0.06]">
          <Tent className="w-4 h-4 text-pine-6 flex-shrink-0" weight="regular" />
          <p className="text-[13px] font-sans font-semibold text-ink">{aiAnalysis.bestUse}</p>
        </div>
        <Pill variant="ghost" sm mono={false} onClick={onReanalyze} className="!w-full !justify-center">
          Re-analyze
        </Pill>
      </div>
    )}
  </DetailSection>
);

