import { ListBullets, MapTrifold } from '@phosphor-icons/react';

interface MobileViewTabsProps {
  mobileView: 'list' | 'map';
  onChange: (view: 'list' | 'map') => void;
}

export const MobileViewTabs = ({ mobileView, onChange }: MobileViewTabsProps) => {
  return (
    <div className="flex border-b border-border">
      <button
        onClick={() => onChange('list')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
          mobileView === 'list'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground'
        }`}
      >
        <ListBullets className="w-4 h-4" />
        List
      </button>
      <button
        onClick={() => onChange('map')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
          mobileView === 'map'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground'
        }`}
      >
        <MapTrifold className="w-4 h-4" />
        Map
      </button>
    </div>
  );
};
