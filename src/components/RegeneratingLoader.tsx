import { useEffect, useState } from 'react';
import { Boot, MapPin, MapPinArea, Tent } from '@phosphor-icons/react';

const loaderStates = [
  { icon: MapPin, color: '#34b5a5', bg: 'bg-aquateal/20', label: 'Finding locations...' },
  { icon: MapPinArea, color: '#6b5ce6', bg: 'bg-lavenderslate/20', label: 'Planning destinations...' },
  { icon: Boot, color: '#3c8a79', bg: 'bg-pinesoft/20', label: 'Discovering hikes...' },
  { icon: Tent, color: '#a855f7', bg: 'bg-wildviolet/20', label: 'Finding campsites...' },
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
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-8 shadow-lg flex flex-col items-center gap-5">
        <div className="relative">
          <svg className="w-20 h-20 animate-spin" viewBox="0 0 50 50">
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="80, 200"
              className="opacity-20"
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
          <div className={`absolute inset-0 flex items-center justify-center`}>
            <div className={`w-12 h-12 rounded-full ${current.bg} flex items-center justify-center transition-all duration-500`}>
              <Icon className="w-6 h-6 transition-all duration-500" style={{ color: current.color }} />
            </div>
          </div>
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground text-lg">Regenerating Trip</p>
          <p className="text-sm text-muted-foreground transition-all duration-300">{current.label}</p>
        </div>
      </div>
    </div>
  );
};
