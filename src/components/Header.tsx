import { Compass, Menu, User, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container flex items-center justify-between h-16 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-xl">
            <Compass className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-display font-bold text-foreground">RoamsWild</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Explore
          </Link>
          <Link to="/create-trip" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            My Trips
          </Link>
          <Link to="/saved" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Saved
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/create-trip">
            <Button variant="hero" size="sm" className="hidden md:flex">
              <Plus className="w-4 h-4 mr-1" />
              Create Trip
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="hidden md:flex">
            <User className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};