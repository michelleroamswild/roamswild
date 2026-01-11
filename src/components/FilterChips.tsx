import { useState } from "react";
import { Button } from "./ui/button";
import { Mountains, GasPump, Tent, Drop, Camera, ForkKnife, Wrench, Wifi } from "@phosphor-icons/react";

const filters = [
  { id: "hikes", label: "Hikes", icon: Mountains },
  { id: "gas", label: "Gas Stations", icon: GasPump },
  { id: "campsites", label: "Campsites", icon: Tent },
  { id: "water", label: "Water Access", icon: Drop },
  { id: "viewpoints", label: "Viewpoints", icon: Camera },
  { id: "food", label: "Food & Dining", icon: ForkKnife },
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
