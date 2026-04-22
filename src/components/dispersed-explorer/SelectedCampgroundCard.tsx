import { TreeEvergreen } from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';
import { EstablishedCampground } from '@/hooks/use-dispersed-roads';

interface SelectedCampgroundCardProps {
  campground: EstablishedCampground;
}

export const SelectedCampgroundCard = ({ campground }: SelectedCampgroundCardProps) => {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
          <TreeEvergreen className="w-4 h-4 text-blue-600" />
          Campground Details
        </h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Name:</span> {campground.name}</p>
          <p><span className="text-muted-foreground">Type:</span> {campground.facilityType}</p>
          <p><span className="text-muted-foreground">Coordinates:</span> {campground.lat.toFixed(5)}, {campground.lng.toFixed(5)}</p>
          {campground.reservable && (
            <p className="flex items-center gap-1">
              <span className="text-muted-foreground">Reservable:</span>
              <span className="text-green-600">Yes</span>
            </p>
          )}
          {campground.description && (
            <p className="text-xs text-muted-foreground mt-2">{campground.description}</p>
          )}
          {campground.url && (
            <a
              href={campground.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
            >
              View on Recreation.gov →
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
