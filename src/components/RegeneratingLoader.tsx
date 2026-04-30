import { useEffect, useState } from 'react';
import { Boot, MapPin, MapPinArea, Tent } from '@phosphor-icons/react';
import { Mono } from '@/components/redesign';

// Animated loader shown while a trip is being regenerated. Cycles through
// four scene-of-work states with rotating accent colors from the redesign
// palette (water/pine/sage/clay).
const loaderStates = [
  { Icon: MapPin,     color: 'hsl(var(--water))',  bg: 'bg-water/15',  label: 'Finding locations…' },
  { Icon: MapPinArea, color: 'hsl(var(--pine-6))', bg: 'bg-pine-6/15', label: 'Planning destinations…' },
  { Icon: Boot,       color: 'hsl(var(--sage))',   bg: 'bg-sage/15',   label: 'Discovering hikes…' },
  { Icon: Tent,       color: 'hsl(var(--clay))',   bg: 'bg-clay/15',   label: 'Finding campsites…' },
];

export const RegeneratingLoader = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % loaderStates.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const current = loaderStates[currentIndex];
  const { Icon } = current;

  return (
    <div className="fixed inset-0 z-[60] bg-cream/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white border border-line rounded-[18px] px-10 py-9 shadow-[0_18px_44px_rgba(29,34,24,0.12)] flex flex-col items-center gap-5 max-w-[320px]">
        <div className="relative">
          <svg className="w-20 h-20 animate-spin" viewBox="0 0 50 50">
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
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-12 h-12 rounded-full ${current.bg} flex items-center justify-center transition-all duration-500`}>
              <Icon className="w-6 h-6 transition-all duration-500" style={{ color: current.color }} weight="regular" />
            </div>
          </div>
        </div>
        <div className="text-center">
          <Mono className="text-pine-6">Regenerating trip</Mono>
          <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink mt-1.5 transition-all duration-300">
            {current.label}
          </p>
        </div>
      </div>
    </div>
  );
};
