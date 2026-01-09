import { Search, MapPin } from "lucide-react";
import { useState } from "react";

export const SearchBar = () => {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div 
      className={`
        relative w-full max-w-2xl mx-auto transition-all duration-300
        ${isFocused ? 'scale-[1.02]' : 'scale-100'}
      `}
    >
      <div 
        className={`
          flex items-center gap-3 bg-card border-2 rounded-2xl px-5 py-4
          shadow-search transition-all duration-300
          ${isFocused ? 'border-primary shadow-card-hover' : 'border-transparent'}
        `}
      >
        <MapPin className="w-5 h-5 text-terracotta flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search destinations, trails, or campsites..."
          className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-lg outline-none"
        />
        <button className="flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-xl hover:bg-forest-light transition-colors duration-200 shadow-sm">
          <Search className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
