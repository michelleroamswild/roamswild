import { MapTrifold, Tent, Sparkle, Compass } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type BuildMethod = 'ai' | 'manual';

interface StepBuildMethodProps {
  buildMethod: BuildMethod | null;
  setBuildMethod: (method: BuildMethod) => void;
}

export function StepBuildMethod({
  buildMethod,
  setBuildMethod,
}: StepBuildMethodProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          How do you want to build your trip?
        </h2>
        <p className="text-muted-foreground">
          Choose your adventure style
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* AI Generated Option */}
        <button
          type="button"
          onClick={() => setBuildMethod('ai')}
          className={cn(
            "relative flex flex-col items-center p-6 rounded-xl border-2 transition-all text-left",
            "hover:border-primary/50 hover:bg-primary/5",
            buildMethod === 'ai'
              ? "border-primary bg-primary/10"
              : "border-border bg-card"
          )}
        >
          {buildMethod === 'ai' && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}

          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Sparkle className="w-8 h-8 text-primary" weight="fill" />
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-2">
            Plan My Route
          </h3>

          <p className="text-sm text-muted-foreground text-center">
            Add your destinations and let AI create a complete itinerary with campsites and activities
          </p>

          <div className="flex items-center gap-2 mt-4 text-xs text-primary">
            <MapTrifold className="w-4 h-4" />
            <span>Best for exploring new areas</span>
          </div>
        </button>

        {/* Manual Build Option */}
        <button
          type="button"
          onClick={() => setBuildMethod('manual')}
          className={cn(
            "relative flex flex-col items-center p-6 rounded-xl border-2 transition-all text-left",
            "hover:border-primary/50 hover:bg-primary/5",
            buildMethod === 'manual'
              ? "border-primary bg-primary/10"
              : "border-border bg-card"
          )}
        >
          {buildMethod === 'manual' && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}

          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Compass className="w-8 h-8 text-primary" weight="fill" />
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-2">
            Build My Own
          </h3>

          <p className="text-sm text-muted-foreground text-center">
            Handpick your campsites and activities day by day with recommendations to guide you
          </p>

          <div className="flex items-center gap-2 mt-4 text-xs text-primary">
            <Tent className="w-4 h-4" />
            <span>Best when you know your spots</span>
          </div>
        </button>
      </div>
    </div>
  );
}
