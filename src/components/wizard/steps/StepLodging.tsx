import { Label } from "@/components/ui/label";
import { LodgingType } from "@/types/trip";

const LODGING_OPTIONS = [
  { id: "dispersed", label: "Dispersed Camping", description: "Free camping on public lands" },
  { id: "campground", label: "Established Camping", description: "Campgrounds with amenities" },
];

const CAMPSITE_SELECTION_OPTIONS = [
  {
    id: "best-each-night",
    label: "Choose the best campsite for each night",
    description: "We'll find available campsites and pick the best option for each night of your trip",
    baseCampMode: false,
  },
  {
    id: "basecamp",
    label: "Setup basecamp at a single site",
    description: "Stay at the same campsite every night - great for exploring from one location",
    baseCampMode: true,
  },
];

interface StepLodgingProps {
  globalLodging: LodgingType;
  setGlobalLodging: (type: LodgingType) => void;
  baseCampMode: boolean;
  setBaseCampMode: (value: boolean) => void;
}

export function StepLodging({
  globalLodging,
  setGlobalLodging,
  baseCampMode,
  setBaseCampMode,
}: StepLodgingProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Lodging Preferences
        </h2>
        <p className="text-muted-foreground">
          Choose where you'll stay each night
        </p>
      </div>

      {/* Lodging Type Selection */}
      <div className="space-y-3">
        <Label>Select lodging type</Label>
        <div className="grid gap-2">
          {LODGING_OPTIONS.map((option) => (
            <label
              key={option.id}
              htmlFor={`lodging-${option.id}`}
              className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                globalLodging === option.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <input
                type="radio"
                id={`lodging-${option.id}`}
                name="lodging-type"
                value={option.id}
                checked={globalLodging === option.id}
                onChange={(e) => setGlobalLodging(e.target.value as LodgingType)}
                className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
              />
              <div className="space-y-0.5">
                <span className="font-medium text-sm">{option.label}</span>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Campsite Selection Mode */}
      <div className="space-y-3">
        <Label>How should we pick your campsites?</Label>
        <div className="grid gap-2">
          {CAMPSITE_SELECTION_OPTIONS.map((option) => (
            <label
              key={option.id}
              htmlFor={`campsite-${option.id}`}
              className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                baseCampMode === option.baseCampMode ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <input
                type="radio"
                id={`campsite-${option.id}`}
                name="campsite-selection"
                checked={baseCampMode === option.baseCampMode}
                onChange={() => setBaseCampMode(option.baseCampMode)}
                className="h-4 w-4 mt-0.5 cursor-pointer accent-[hsl(var(--forest))]"
              />
              <div className="space-y-0.5">
                <span className="font-medium text-sm">{option.label}</span>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
