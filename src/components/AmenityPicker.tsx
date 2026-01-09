import { Fuel, Droplet, UtensilsCrossed, Tent, Mountain, Coffee, Signal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StopType } from '@/types/trip';

const amenityTypes: { type: StopType; label: string; icon: typeof Fuel; searchQuery: string }[] = [
  { type: 'gas', label: 'Gas Station', icon: Fuel, searchQuery: 'gas station' },
  { type: 'water', label: 'Water Fill', icon: Droplet, searchQuery: 'water refill station' },
  { type: 'food', label: 'Food & Dining', icon: UtensilsCrossed, searchQuery: 'restaurant' },
  { type: 'camp', label: 'Campsite', icon: Tent, searchQuery: 'campground' },
  { type: 'viewpoint', label: 'Viewpoint', icon: Mountain, searchQuery: 'scenic viewpoint' },
  { type: 'rest', label: 'Rest Area', icon: Coffee, searchQuery: 'rest area' },
  { type: 'cell', label: 'Cell Service', icon: Signal, searchQuery: 'cell tower' },
];

interface AmenityPickerProps {
  onSelect: (type: StopType, searchQuery: string) => void;
}

export function AmenityPicker({ onSelect }: AmenityPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Amenity
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {amenityTypes.map(({ type, label, icon: Icon, searchQuery }) => (
          <DropdownMenuItem
            key={type}
            onClick={() => onSelect(type, searchQuery)}
            className="gap-2 cursor-pointer"
          >
            <Icon className="w-4 h-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
