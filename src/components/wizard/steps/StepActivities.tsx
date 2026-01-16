import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PacePreference } from "@/types/trip";

const ACTIVITIES = [
  { id: "hiking", label: "Hiking", description: "Find trails and hikes along your route" },
  { id: "photography", label: "Photography", description: "Find photo hotspots and scenic viewpoints" },
  { id: "offroading", label: "Offroading", description: "Find trails and off-highway routes" },
];

interface StepActivitiesProps {
  activities: string[];
  setActivities: (activities: string[]) => void;
  offroadVehicle: '4wd-high' | 'awd-medium';
  setOffroadVehicle: (type: '4wd-high' | 'awd-medium') => void;
  pacePreference: PacePreference;
  setPacePreference: (pace: PacePreference) => void;
}

export function StepActivities({
  activities,
  setActivities,
  offroadVehicle,
  setOffroadVehicle,
  pacePreference,
  setPacePreference,
}: StepActivitiesProps) {
  const handleActivityChange = (activityId: string, checked: boolean) => {
    if (checked) {
      setActivities([...activities, activityId]);
    } else {
      setActivities(activities.filter(id => id !== activityId));
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Activities
        </h2>
        <p className="text-muted-foreground">
          What do you want to do on your trip?
        </p>
      </div>

      {/* Activities Selection */}
      <div className="space-y-3">
        <Label>Select activities to include</Label>
        {ACTIVITIES.map((activity) => {
          const isSelected = activities.includes(activity.id);
          return (
            <div
              key={activity.id}
              className={`rounded-lg border transition-colors ${
                isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <label
                htmlFor={`activity-${activity.id}`}
                className="flex items-start space-x-3 p-3 cursor-pointer"
              >
                <Checkbox
                  id={`activity-${activity.id}`}
                  checked={isSelected}
                  onCheckedChange={(checked) => handleActivityChange(activity.id, checked === true)}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-0.5">
                  <span className="font-medium text-sm">{activity.label}</span>
                  <p className="text-xs text-muted-foreground">
                    {activity.description}
                  </p>
                </div>
              </label>

              {/* Conditional vehicle selection for offroading */}
              {activity.id === 'offroading' && isSelected && (
                <div className="px-3 pb-3 pt-1 ml-7 space-y-2 animate-fade-in">
                  <p className="text-xs text-muted-foreground mb-2">What's your vehicle?</p>
                  <label htmlFor="offroad-4wd" className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      id="offroad-4wd"
                      name="offroad-vehicle"
                      value="4wd-high"
                      checked={offroadVehicle === '4wd-high'}
                      onChange={(e) => setOffroadVehicle(e.target.value as '4wd-high' | 'awd-medium')}
                      className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                    />
                    <span className="text-sm">4WD high clearance</span>
                  </label>
                  <label htmlFor="offroad-awd" className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      id="offroad-awd"
                      name="offroad-vehicle"
                      value="awd-medium"
                      checked={offroadVehicle === 'awd-medium'}
                      onChange={(e) => setOffroadVehicle(e.target.value as '4wd-high' | 'awd-medium')}
                      className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                    />
                    <span className="text-sm">AWD medium clearance</span>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Trip Pace */}
      <div className="space-y-3 pt-4 border-t border-border">
        <Label>Trip Pace</Label>
        <p className="text-xs text-muted-foreground mb-2">
          How packed do you want each day to be?
        </p>
        <div className="grid gap-2">
          <label
            htmlFor="pace-relaxed"
            className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              pacePreference === 'relaxed' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              id="pace-relaxed"
              name="pace-preference"
              value="relaxed"
              checked={pacePreference === 'relaxed'}
              onChange={(e) => setPacePreference(e.target.value as PacePreference)}
              className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
            />
            <div className="space-y-0.5">
              <span className="font-medium text-sm">Relaxed</span>
              <p className="text-xs text-muted-foreground">Fewer activities, more downtime</p>
            </div>
          </label>
          <label
            htmlFor="pace-moderate"
            className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              pacePreference === 'moderate' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              id="pace-moderate"
              name="pace-preference"
              value="moderate"
              checked={pacePreference === 'moderate'}
              onChange={(e) => setPacePreference(e.target.value as PacePreference)}
              className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
            />
            <div className="space-y-0.5">
              <span className="font-medium text-sm">Moderate</span>
              <p className="text-xs text-muted-foreground">Balanced activity and rest</p>
            </div>
          </label>
          <label
            htmlFor="pace-packed"
            className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              pacePreference === 'packed' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              id="pace-packed"
              name="pace-preference"
              value="packed"
              checked={pacePreference === 'packed'}
              onChange={(e) => setPacePreference(e.target.value as PacePreference)}
              className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
            />
            <div className="space-y-0.5">
              <span className="font-medium text-sm">Packed</span>
              <p className="text-xs text-muted-foreground">Maximum activities each day</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
