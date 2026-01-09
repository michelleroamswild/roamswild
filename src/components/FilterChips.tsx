import { useState } from "react";
import { Button } from "./ui/button";
import { Mountain, Fuel, Tent, Droplets, Camera, Utensils, Wrench, Wifi } from "lucide-react";

const filters = [
  { id: "hikes", label: "Hikes", icon: Mountain },
  { id: "gas", label: "Gas Stations", icon: Fuel },
  { id: "campsites", label: "Campsites", icon: Tent },
  { id: "water", label: "Water Access", icon: Droplets },
  { id: "viewpoints", label: "Viewpoints", icon: Camera },
  { id: "food", label: "Food & Dining", icon: Utensils },
  { id: "services", label: "Services", icon: Wrench },
  { id: "connectivity", label: "Cell Service", icon: Wifi },
];

export const FilterChips = () => {
  const [activeFilters, setActiveFilters] = useState<string[]>(["hikes", "campsites"]);

  const toggleFilter = (id: string) => {
    setActiveFilters((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
      {filters.map((filter, index) => {
        const Icon = filter.icon;
        const isActive = activeFilters.includes(filter.id);
        return (
          <Button
            key={filter.id}
            variant={isActive ? "chip-active" : "chip"}
            size="chip"
            onClick={() => toggleFilter(filter.id)}
            className="animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <Icon className="w-3.5 h-3.5" />
            {filter.label}
          </Button>
        );
      })}
    </div>
  );
};
