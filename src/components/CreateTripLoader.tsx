import { useEffect, useState } from "react";
import { Boot, MapPin, MapPinArea, Tent } from "@phosphor-icons/react";
import { Mono } from "@/components/redesign";

interface CreateTripLoaderProps {
  /** Mono cap displayed at the top — e.g. "Building your trip" / "Regenerating trip". */
  headline?: string;
  tripName?: string;
  destinations?: Array<{ name: string }>;
}

// Cycles through scene-of-work states with rotating accent colors from the
// redesign palette (water/pine/sage/clay).
const STAGES = [
  { Icon: MapPin,     color: "hsl(var(--water))",  bg: "bg-water/15",  label: "Finding locations…" },
  { Icon: MapPinArea, color: "hsl(var(--pine-6))", bg: "bg-pine-6/15", label: "Planning destinations…" },
  { Icon: Boot,       color: "hsl(var(--sage))",   bg: "bg-sage/15",   label: "Discovering hikes…" },
  { Icon: Tent,       color: "hsl(var(--clay))",   bg: "bg-clay/15",   label: "Finding campsites…" },
];

export function CreateTripLoader({
  headline = "Building your trip",
  tripName,
  destinations = [],
}: CreateTripLoaderProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % STAGES.length);
    }, 1200);
    return () => clearInterval(id);
  }, []);

  const current = STAGES[step];
  const { Icon } = current;
  const heroTitle = tripName?.trim() || "Crafting your route";
  const destChain = destinations.map((d) => d.name).filter(Boolean).join("  →  ");

  return (
    <div className="fixed inset-0 z-[60] bg-cream dark:bg-paper text-ink font-sans flex flex-col items-center justify-center px-6 text-center">
      <Mono className="text-pine-6">{headline}</Mono>

      <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[40px] leading-[1.05] mt-3 max-w-[640px]">
        {heroTitle}.
      </h2>

      {destChain && (
        <p className="text-[12px] text-ink-3 mt-3 font-mono uppercase tracking-[0.10em]">
          {destChain}
        </p>
      )}

      {/* Spinning ring with a cycling colored icon in the center */}
      <div className="relative mt-12 mb-6">
        <svg className="w-24 h-24 animate-spin" viewBox="0 0 50 50">
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="hsl(var(--line))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="80, 200"
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke={current.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="40, 200"
            className="transition-[stroke] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`w-14 h-14 rounded-full ${current.bg} flex items-center justify-center transition-colors duration-500`}
          >
            <Icon
              className="w-7 h-7 transition-colors duration-500"
              style={{ color: current.color }}
              weight="regular"
            />
          </div>
        </div>
      </div>

      <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink transition-opacity duration-300">
        {current.label}
      </p>
      <p className="text-[12px] text-ink-3 mt-2">Usually takes 10–20 seconds.</p>
    </div>
  );
}
