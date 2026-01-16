import { useState, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ActivityType, PacePreference } from "@/types/trip";

const ACTIVITIES = [
  { id: "hiking", label: "Hiking", description: "Find trails and hikes along your route" },
  { id: "photography", label: "Photography", description: "Find photo hotspots and scenic viewpoints" },
  { id: "offroading", label: "Offroading", description: "Find trails and off-highway routes" },
];

interface ActivityEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities: string[];
  pacePreference?: PacePreference;
  offroadVehicleType?: '4wd-high' | 'awd-medium';
  onSave: (data: {
    activities: string[];
    pacePreference: PacePreference;
    offroadVehicleType?: '4wd-high' | 'awd-medium';
  }) => void;
}

export function ActivityEditorModal({
  isOpen,
  onClose,
  activities: initialActivities,
  pacePreference: initialPace = 'moderate',
  offroadVehicleType: initialOffroadVehicle,
  onSave,
}: ActivityEditorModalProps) {
  const [activities, setActivities] = useState<string[]>(initialActivities);
  const [pacePreference, setPacePreference] = useState<PacePreference>(initialPace);
  const [offroadVehicle, setOffroadVehicle] = useState<'4wd-high' | 'awd-medium'>(
    initialOffroadVehicle || '4wd-high'
  );

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActivities(initialActivities);
      setPacePreference(initialPace);
      setOffroadVehicle(initialOffroadVehicle || '4wd-high');
    }
  }, [isOpen, initialActivities, initialPace, initialOffroadVehicle]);

  const handleActivityChange = (activityId: string, checked: boolean) => {
    if (checked) {
      setActivities([...activities, activityId]);
    } else {
      setActivities(activities.filter(id => id !== activityId));
    }
  };

  const handleSave = () => {
    onSave({
      activities,
      pacePreference,
      offroadVehicleType: activities.includes('offroading') ? offroadVehicle : undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-display font-bold text-foreground">Edit Activities</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Activities Selection */}
          <div className="space-y-3">
            <Label>Activities to include</Label>
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
                    htmlFor={`modal-activity-${activity.id}`}
                    className="flex items-start space-x-3 p-3 cursor-pointer"
                  >
                    <Checkbox
                      id={`modal-activity-${activity.id}`}
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
                      <label htmlFor="modal-offroad-4wd" className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          id="modal-offroad-4wd"
                          name="modal-offroad-vehicle"
                          value="4wd-high"
                          checked={offroadVehicle === '4wd-high'}
                          onChange={(e) => setOffroadVehicle(e.target.value as '4wd-high' | 'awd-medium')}
                          className="h-4 w-4 cursor-pointer accent-[hsl(var(--forest))]"
                        />
                        <span className="text-sm">4WD high clearance</span>
                      </label>
                      <label htmlFor="modal-offroad-awd" className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          id="modal-offroad-awd"
                          name="modal-offroad-vehicle"
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
            <div className="grid gap-2">
              <label
                htmlFor="modal-pace-relaxed"
                className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  pacePreference === 'relaxed' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  id="modal-pace-relaxed"
                  name="modal-pace-preference"
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
                htmlFor="modal-pace-moderate"
                className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  pacePreference === 'moderate' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  id="modal-pace-moderate"
                  name="modal-pace-preference"
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
                htmlFor="modal-pace-packed"
                className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  pacePreference === 'packed' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  id="modal-pace-packed"
                  name="modal-pace-preference"
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

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-6 py-4 flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} className="flex-1">
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
