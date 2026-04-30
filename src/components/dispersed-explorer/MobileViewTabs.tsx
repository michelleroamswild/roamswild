import { ListBullets, MapTrifold } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface MobileViewTabsProps {
  mobileView: 'list' | 'map';
  onChange: (view: 'list' | 'map') => void;
}

// Mobile-only tab pair: same pill pattern as the redesigned nav bar — solid
// ink for the active view, transparent ink for the inactive.
export const MobileViewTabs = ({ mobileView, onChange }: MobileViewTabsProps) => {
  const tabs: { key: 'list' | 'map'; label: string; Icon: typeof ListBullets }[] = [
    { key: 'list', label: 'List', Icon: ListBullets },
    { key: 'map',  label: 'Map',  Icon: MapTrifold },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {tabs.map(({ key, label, Icon }) => {
        const active = mobileView === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] transition-colors',
              active ? 'bg-ink text-cream hover:bg-ink-2' : 'text-ink hover:bg-ink/5',
            )}
          >
            <Icon className="w-4 h-4" weight="regular" />
            {label}
          </button>
        );
      })}
    </div>
  );
};
