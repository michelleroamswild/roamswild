import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, MapPin, Fuel, Droplet, UtensilsCrossed, Tent, Mountain, Coffee, Signal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TripStop, StopType } from '@/types/trip';

const iconMap = {
  destination: MapPin,
  gas: Fuel,
  water: Droplet,
  food: UtensilsCrossed,
  camp: Tent,
  viewpoint: Mountain,
  rest: Coffee,
  cell: Signal,
};

const colorMap: Record<StopType, string> = {
  destination: 'bg-primary/10 text-primary border-primary/20',
  gas: 'bg-terracotta/10 text-terracotta border-terracotta/20',
  water: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  food: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  camp: 'bg-forest/10 text-forest border-forest/20',
  viewpoint: 'bg-primary/10 text-primary border-primary/20',
  rest: 'bg-amber-600/10 text-amber-600 border-amber-600/20',
  cell: 'bg-green-500/10 text-green-500 border-green-500/20',
};

interface TripStopItemProps {
  stop: TripStop;
  onRemove: () => void;
}

export function TripStopItem({ stop, onRemove }: TripStopItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = iconMap[stop.stopType];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 p-3 bg-card rounded-xl border border-border
        ${isDragging ? 'opacity-50 shadow-lg' : ''}
      `}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className={`flex items-center justify-center w-10 h-10 rounded-lg border ${colorMap[stop.stopType]}`}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{stop.name}</p>
        {stop.address && (
          <p className="text-xs text-muted-foreground truncate">{stop.address}</p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
