import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Boot,
  Tent,
  GasPump,
  MapPin,
  MapPinArea,
  Camera,
  NavigationArrow,
  Star,
  Heart,
  Plus,
  Trash,
  ArrowsClockwise,
  Check,
  X,
  Warning,
  Info,
  CaretDown,
  CaretUp,
  MagnifyingGlass,
  Gear,
  User,
  SignOut,
  Share,
  Copy,
  Path,
  Clock,
  Calendar,
  Sun,
  Moon,
  Cloud,
  Mountains,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { getTypeStyles } from '@/utils/mapMarkers';

const StyleGuide = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Style Guide</h1>
              <p className="text-sm text-muted-foreground">UI Components & Design System</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-8 space-y-12">
        {/* Colors */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Colors</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Core Colors</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-primary"></div>
                  <p className="text-sm font-medium">Primary</p>
                  <p className="text-xs text-muted-foreground font-mono">#3f3e2c</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(69 17% 21%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-secondary"></div>
                  <p className="text-sm font-medium">Secondary</p>
                  <p className="text-xs text-muted-foreground font-mono">#e9e5d4</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(51 37% 89%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-accent"></div>
                  <p className="text-sm font-medium">Accent</p>
                  <p className="text-xs text-muted-foreground font-mono">#a5c94a</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(74 68% 56%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-destructive"></div>
                  <p className="text-sm font-medium">Destructive</p>
                  <p className="text-xs text-muted-foreground font-mono">#ef4444</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(0 84% 60%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-muted"></div>
                  <p className="text-sm font-medium">Muted</p>
                  <p className="text-xs text-muted-foreground font-mono">#e0d9cf</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 20% 85%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-card border"></div>
                  <p className="text-sm font-medium">Card</p>
                  <p className="text-xs text-muted-foreground font-mono">#f9f8f6</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(36 23% 97%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-background-secondary"></div>
                  <p className="text-sm font-medium">Background Secondary</p>
                  <p className="text-xs text-muted-foreground font-mono">#b09d7d</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 20% 62%)</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Custom Accent Colors</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-pinesoft"></div>
                  <p className="text-sm font-medium">Pinesoft</p>
                  <p className="text-xs text-muted-foreground">Hikes</p>
                  <p className="text-xs text-muted-foreground font-mono">#4da391</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(167 39% 49%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-softamber"></div>
                  <p className="text-sm font-medium">Soft Amber</p>
                  <p className="text-xs text-muted-foreground">Campsites</p>
                  <p className="text-xs text-muted-foreground font-mono">#eaaf3c</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(40 83% 63%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-skyblue"></div>
                  <p className="text-sm font-medium">Sky Blue</p>
                  <p className="text-xs text-muted-foreground">Viewpoints</p>
                  <p className="text-xs text-muted-foreground font-mono">#94c4f5</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(212 86% 77%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-blushorchid"></div>
                  <p className="text-sm font-medium">Blush Orchid</p>
                  <p className="text-xs text-muted-foreground">Photo Spots</p>
                  <p className="text-xs text-muted-foreground font-mono">#f0a5c4</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(332 76% 79%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-aquateal"></div>
                  <p className="text-sm font-medium">Aqua Teal</p>
                  <p className="text-xs text-muted-foreground">Start/End</p>
                  <p className="text-xs text-muted-foreground font-mono">#5cc9be</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(171 60% 64%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-lavenderslate"></div>
                  <p className="text-sm font-medium">Lavender Slate</p>
                  <p className="text-xs text-muted-foreground">Default</p>
                  <p className="text-xs text-muted-foreground font-mono">#a99bf0</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(249 80% 75%)</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Map Marker Colors (Darkened 20%)</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: '#3c8a79' }}></div>
                  <p className="text-sm font-medium">Hike Marker</p>
                  <p className="text-xs text-muted-foreground font-mono">#3c8a79</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(167 39% 39%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: '#ea9b0c' }}></div>
                  <p className="text-sm font-medium">Camp Marker</p>
                  <p className="text-xs text-muted-foreground font-mono">#ea9b0c</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(40 83% 50%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: '#4a96ed' }}></div>
                  <p className="text-sm font-medium">Viewpoint Marker</p>
                  <p className="text-xs text-muted-foreground font-mono">#4a96ed</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(212 86% 62%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: '#e85a9a' }}></div>
                  <p className="text-sm font-medium">Photo Marker</p>
                  <p className="text-xs text-muted-foreground font-mono">#e85a9a</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(332 76% 63%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: '#34b5a5' }}></div>
                  <p className="text-sm font-medium">Start/End Marker</p>
                  <p className="text-xs text-muted-foreground font-mono">#34b5a5</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(171 60% 51%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: '#6b5ce6' }}></div>
                  <p className="text-sm font-medium">Default Marker</p>
                  <p className="text-xs text-muted-foreground font-mono">#6b5ce6</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(249 80% 60%)</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Earth Tones</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-forest"></div>
                  <p className="text-sm font-medium">Forest</p>
                  <p className="text-xs text-muted-foreground font-mono">#6b8a1d</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(74 68% 35%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-forest-light"></div>
                  <p className="text-sm font-medium">Forest Light</p>
                  <p className="text-xs text-muted-foreground font-mono">#a5c94a</p>
                  <p className="text-xs text-muted-foreground font-mono">var(--accent)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-sand"></div>
                  <p className="text-sm font-medium">Sand</p>
                  <p className="text-xs text-muted-foreground font-mono">#e2d9c9</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 35% 85%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-sand-dark"></div>
                  <p className="text-sm font-medium">Sand Dark</p>
                  <p className="text-xs text-muted-foreground font-mono">#ccc2b0</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 25% 75%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-terracotta"></div>
                  <p className="text-sm font-medium">Terracotta</p>
                  <p className="text-xs text-muted-foreground font-mono">#cd6a3d</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(20 65% 55%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-cream"></div>
                  <p className="text-sm font-medium">Cream</p>
                  <p className="text-xs text-muted-foreground font-mono">#e0d9cf</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 20% 85%)</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Dark Theme */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Dark Theme Preview</h2>
          <div className="dark bg-background rounded-xl p-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3 text-foreground">Core Colors (Dark)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-primary"></div>
                  <p className="text-sm font-medium text-foreground">Primary</p>
                  <p className="text-xs text-muted-foreground font-mono">#e0d9cf</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 20% 85%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-secondary"></div>
                  <p className="text-sm font-medium text-foreground">Secondary</p>
                  <p className="text-xs text-muted-foreground font-mono">#ccc2b0</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 25% 75%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-accent"></div>
                  <p className="text-sm font-medium text-foreground">Accent</p>
                  <p className="text-xs text-muted-foreground font-mono">#a5c94a</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(74 68% 56%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-destructive"></div>
                  <p className="text-sm font-medium text-foreground">Destructive</p>
                  <p className="text-xs text-muted-foreground font-mono">#bd3c3c</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(0 65% 45%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-muted"></div>
                  <p className="text-sm font-medium text-foreground">Muted</p>
                  <p className="text-xs text-muted-foreground font-mono">#28251f</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(30 10% 16%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-card border border-border"></div>
                  <p className="text-sm font-medium text-foreground">Card</p>
                  <p className="text-xs text-muted-foreground font-mono">#353425</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(69 17% 18%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-background-secondary"></div>
                  <p className="text-sm font-medium text-foreground">Background Secondary</p>
                  <p className="text-xs text-muted-foreground font-mono">#4a3f30</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 20% 22%)</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3 text-foreground">Background & Foreground (Dark)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-background border border-border"></div>
                  <p className="text-sm font-medium text-foreground">Background</p>
                  <p className="text-xs text-muted-foreground font-mono">#1e1d15</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(69 17% 10%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-foreground"></div>
                  <p className="text-sm font-medium text-foreground">Foreground</p>
                  <p className="text-xs text-muted-foreground font-mono">#f9f8f6</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(36 23% 97%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-border"></div>
                  <p className="text-sm font-medium text-foreground">Border</p>
                  <p className="text-xs text-muted-foreground font-mono">#3f3e2c</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(69 17% 21%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-card-light"></div>
                  <p className="text-sm font-medium text-foreground">Card Light</p>
                  <p className="text-xs text-muted-foreground font-mono">#454435</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(69 17% 24%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-border-light"></div>
                  <p className="text-sm font-medium text-foreground">Border Light</p>
                  <p className="text-xs text-muted-foreground font-mono">#696849</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(69 17% 36%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(40 12% 55%)' }}></div>
                  <p className="text-sm font-medium text-foreground">Muted Foreground</p>
                  <p className="text-xs text-muted-foreground font-mono">#9a907f</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(40 12% 55%)</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3 text-foreground">Earth Tones (Dark)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-forest"></div>
                  <p className="text-sm font-medium text-foreground">Forest</p>
                  <p className="text-xs text-muted-foreground font-mono">#6b8a1d</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(74 68% 35%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-forest-light"></div>
                  <p className="text-sm font-medium text-foreground">Forest Light</p>
                  <p className="text-xs text-muted-foreground font-mono">#a5c94a</p>
                  <p className="text-xs text-muted-foreground font-mono">var(--accent)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-sand"></div>
                  <p className="text-sm font-medium text-foreground">Sand</p>
                  <p className="text-xs text-muted-foreground font-mono">#3d362f</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 15% 22%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-sand-dark"></div>
                  <p className="text-sm font-medium text-foreground">Sand Dark</p>
                  <p className="text-xs text-muted-foreground font-mono">#2c2824</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 12% 16%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-terracotta"></div>
                  <p className="text-sm font-medium text-foreground">Terracotta</p>
                  <p className="text-xs text-muted-foreground font-mono">#bf5f3a</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(20 55% 50%)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg bg-cream"></div>
                  <p className="text-sm font-medium text-foreground">Cream</p>
                  <p className="text-xs text-muted-foreground font-mono">#262320</p>
                  <p className="text-xs text-muted-foreground font-mono">hsl(35 10% 14%)</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Buttons (Dark)</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="tertiary">Tertiary</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Inputs (Dark)</h3>
              <div className="max-w-md space-y-4">
                <Input placeholder="Enter text..." />
                <div className="flex items-center space-x-2">
                  <Checkbox id="dark-checkbox" />
                  <Label htmlFor="dark-checkbox" className="text-foreground cursor-pointer">Checkbox label</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="dark-switch" />
                  <Label htmlFor="dark-switch" className="text-foreground">Switch label</Label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Cards (Dark)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Card Title</CardTitle>
                    <CardDescription>Card description text</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground">Card content in dark mode.</p>
                  </CardContent>
                </Card>
                <Card className="ring-2 ring-border-light border-border-light bg-card-light">
                  <CardHeader>
                    <CardTitle>Active Card</CardTitle>
                    <CardDescription>With border-light ring</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground">Active state in dark mode.</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Typography (Dark)</h3>
              <div className="space-y-2">
                <h4 className="text-xl font-semibold text-foreground">Heading text</h4>
                <p className="text-foreground">Regular body text in dark mode</p>
                <p className="text-muted-foreground">Muted text in dark mode</p>
                <p className="text-primary">Primary colored text</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Button Sizes (Dark)</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="xl">Extra Large</Button>
                <Button size="icon"><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Buttons with Icons (Dark)</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button variant="primary">
                  <Plus className="w-4 h-4" />
                  Add Item
                </Button>
                <Button variant="secondary">
                  <NavigationArrow className="w-4 h-4" />
                  Navigate
                </Button>
                <Button variant="tertiary">
                  <Share className="w-4 h-4" />
                  Share
                </Button>
                <Button variant="destructive">
                  <Trash className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Chip Buttons (Dark)</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <Button variant="chip" size="chip">Filter</Button>
                <Button variant="chip-active" size="chip">Active</Button>
                <Button variant="chip" size="chip">Hiking</Button>
                <Button variant="chip" size="chip">Camping</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Badges (Dark)</h3>
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Stop Type Badges (Dark)</h3>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('hike')}`}>
                  <Boot className="w-3 h-3" /> Hike
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('camp')}`}>
                  <Tent className="w-3 h-3" /> Camp
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('viewpoint')}`}>
                  <MapPinArea className="w-3 h-3" /> Viewpoint
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('photo')}`}>
                  <Camera className="w-3 h-3" /> Photo
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('gas')}`}>
                  <GasPump className="w-3 h-3" /> Gas
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('start')}`}>
                  <MapPin className="w-3 h-3" /> Start/End
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Stop Type Icons (Dark)</h3>
              <div className="flex flex-wrap gap-6 items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-pinesoft/20 flex items-center justify-center">
                    <Boot className="w-5 h-5 text-pinesoft" />
                  </div>
                  <span className="text-xs text-foreground">Hike</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-softamber/20 flex items-center justify-center">
                    <Tent className="w-5 h-5 text-softamber" />
                  </div>
                  <span className="text-xs text-foreground">Camp</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-skyblue/20 flex items-center justify-center">
                    <MapPinArea className="w-5 h-5 text-skyblue" />
                  </div>
                  <span className="text-xs text-foreground">Viewpoint</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blushorchid/20 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-blushorchid" />
                  </div>
                  <span className="text-xs text-foreground">Photo</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blushorchid/20 flex items-center justify-center">
                    <GasPump className="w-5 h-5 text-blushorchid" />
                  </div>
                  <span className="text-xs text-foreground">Gas</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-aquateal/20 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-aquateal" />
                  </div>
                  <span className="text-xs text-foreground">Start/End</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">UI Icons (Dark)</h3>
              <div className="flex flex-wrap gap-4 items-center text-foreground">
                <div className="flex flex-col items-center gap-2">
                  <NavigationArrow className="w-6 h-6" />
                  <span className="text-xs">Navigate</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Star className="w-6 h-6" />
                  <span className="text-xs">Star</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Heart className="w-6 h-6" />
                  <span className="text-xs">Heart</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Plus className="w-6 h-6" />
                  <span className="text-xs">Plus</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Trash className="w-6 h-6" />
                  <span className="text-xs">Trash</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <ArrowsClockwise className="w-6 h-6" />
                  <span className="text-xs">Refresh</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Check className="w-6 h-6" />
                  <span className="text-xs">Check</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <X className="w-6 h-6" />
                  <span className="text-xs">Close</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Warning className="w-6 h-6" />
                  <span className="text-xs">Warning</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Info className="w-6 h-6" />
                  <span className="text-xs">Info</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <MagnifyingGlass className="w-6 h-6" />
                  <span className="text-xs">Search</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Gear className="w-6 h-6" />
                  <span className="text-xs">Settings</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Day Card States (Dark)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                        <span className="text-lg font-bold text-primary">1</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Day 1</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Path className="w-3 h-3" />
                            45 mi
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            1h 15m
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Boot className="w-4 h-4 text-pinesoft" />
                      <Tent className="w-4 h-4 text-softamber" />
                    </div>
                  </div>
                </Card>

                <Card className="ring-2 ring-border-light border-border-light bg-card-light">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-border-light text-foreground">
                        <span className="text-lg font-bold">2</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          Day 2
                          <span className="ml-2 text-xs text-border-light font-normal">(Active)</span>
                        </p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Path className="w-3 h-3" />
                            62 mi
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            1h 45m
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Boot className="w-4 h-4 text-pinesoft" />
                      <Tent className="w-4 h-4 text-softamber" />
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">Border Radius (Dark)</h3>
              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-primary rounded-sm"></div>
                  <span className="text-xs text-foreground">rounded-sm</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-primary rounded"></div>
                  <span className="text-xs text-foreground">rounded</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-primary rounded-md"></div>
                  <span className="text-xs text-foreground">rounded-md</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-primary rounded-lg"></div>
                  <span className="text-xs text-foreground">rounded-lg</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-primary rounded-xl"></div>
                  <span className="text-xs text-foreground">rounded-xl</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-primary rounded-full"></div>
                  <span className="text-xs text-foreground">rounded-full</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Typography */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Typography</h2>
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h1>Heading 1</h1>
                <p className="text-sm text-muted-foreground mt-1">text-4xl md:text-5xl lg:text-6xl font-bold</p>
              </div>
              <div>
                <h2>Heading 2</h2>
                <p className="text-sm text-muted-foreground mt-1">text-3xl md:text-4xl font-bold</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold">Heading 3</h3>
                <p className="text-sm text-muted-foreground mt-1">text-2xl font-bold</p>
              </div>
              <div>
                <h4 className="text-xl font-semibold">Heading 4</h4>
                <p className="text-sm text-muted-foreground mt-1">text-xl font-semibold</p>
              </div>
              <div>
                <p className="text-lg">Large text - text-lg</p>
              </div>
              <div>
                <p className="text-base">Base text - text-base (default)</p>
              </div>
              <div>
                <p className="text-sm">Small text - text-sm</p>
              </div>
              <div>
                <p className="text-xs">Extra small text - text-xs</p>
              </div>
              <div>
                <p className="text-muted-foreground">Muted text - text-muted-foreground</p>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Buttons */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Buttons</h2>

          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">Variants</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="tertiary">Tertiary</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Sizes</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="xl">Extra Large</Button>
                <Button size="icon"><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">With Icons</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button variant="primary">
                  <Plus className="w-4 h-4" />
                  Add Item
                </Button>
                <Button variant="secondary">
                  <NavigationArrow className="w-4 h-4" />
                  Navigate
                </Button>
                <Button variant="tertiary">
                  <Share className="w-4 h-4" />
                  Share
                </Button>
                <Button variant="destructive">
                  <Trash className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Chip Buttons</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <Button variant="chip" size="chip">Filter</Button>
                <Button variant="chip-active" size="chip">Active</Button>
                <Button variant="chip" size="chip">Hiking</Button>
                <Button variant="chip" size="chip">Camping</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">States</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <Button variant="primary">Normal</Button>
                <Button variant="primary" disabled>Disabled</Button>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Inputs */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Inputs</h2>

          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="default">Default Input</Label>
              <Input id="default" placeholder="Enter text..." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="with-icon">With Icon</Label>
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input id="with-icon" className="pl-10" placeholder="Search..." />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="disabled">Disabled</Label>
              <Input id="disabled" placeholder="Disabled input" disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="textarea">Textarea</Label>
              <Textarea id="textarea" placeholder="Enter longer text..." />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="checkbox" />
              <Label htmlFor="checkbox" className="cursor-pointer">Checkbox label</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="switch" />
              <Label htmlFor="switch">Switch label</Label>
            </div>
          </div>
        </section>

        <Separator />

        {/* Cards */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Cards</h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Card Title</CardTitle>
                <CardDescription>Card description text goes here</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Card content goes here. This is where the main information lives.</p>
              </CardContent>
            </Card>

            <Card className="ring-2 ring-primary border-primary">
              <CardHeader>
                <CardTitle>Active Card</CardTitle>
                <CardDescription>With primary ring border</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This card has an active state with primary color border.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <Mountains className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Icon Card</p>
                    <p className="text-sm text-muted-foreground">With icon and content</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Badges */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Badges</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Default Badges</h3>
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Stop Type Badges</h3>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('hike')}`}>
                  <Boot className="w-3 h-3" /> Hike
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('camp')}`}>
                  <Tent className="w-3 h-3" /> Camp
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('viewpoint')}`}>
                  <MapPinArea className="w-3 h-3" /> Viewpoint
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('photo')}`}>
                  <Camera className="w-3 h-3" /> Photo
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('gas')}`}>
                  <GasPump className="w-3 h-3" /> Gas
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeStyles('start')}`}>
                  <MapPin className="w-3 h-3" /> Start/End
                </span>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Icons */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Icons</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Stop Type Icons</h3>
              <div className="flex flex-wrap gap-6 items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-pinesoft/20 flex items-center justify-center">
                    <Boot className="w-5 h-5 text-pinesoft" />
                  </div>
                  <span className="text-xs">Hike</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-softamber/20 flex items-center justify-center">
                    <Tent className="w-5 h-5 text-softamber" />
                  </div>
                  <span className="text-xs">Camp</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-skyblue/20 flex items-center justify-center">
                    <MapPinArea className="w-5 h-5 text-skyblue" />
                  </div>
                  <span className="text-xs">Viewpoint</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blushorchid/20 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-blushorchid" />
                  </div>
                  <span className="text-xs">Photo</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blushorchid/20 flex items-center justify-center">
                    <GasPump className="w-5 h-5 text-blushorchid" />
                  </div>
                  <span className="text-xs">Gas</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-aquateal/20 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-aquateal" />
                  </div>
                  <span className="text-xs">Start/End</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">UI Icons</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex flex-col items-center gap-2">
                  <NavigationArrow className="w-6 h-6" />
                  <span className="text-xs">Navigate</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Star className="w-6 h-6" />
                  <span className="text-xs">Star</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Heart className="w-6 h-6" />
                  <span className="text-xs">Heart</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Plus className="w-6 h-6" />
                  <span className="text-xs">Plus</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Trash className="w-6 h-6" />
                  <span className="text-xs">Trash</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <ArrowsClockwise className="w-6 h-6" />
                  <span className="text-xs">Refresh</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Check className="w-6 h-6" />
                  <span className="text-xs">Check</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <X className="w-6 h-6" />
                  <span className="text-xs">Close</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Warning className="w-6 h-6" />
                  <span className="text-xs">Warning</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Info className="w-6 h-6" />
                  <span className="text-xs">Info</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <CaretDown className="w-6 h-6" />
                  <span className="text-xs">Caret Down</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <CaretUp className="w-6 h-6" />
                  <span className="text-xs">Caret Up</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <MagnifyingGlass className="w-6 h-6" />
                  <span className="text-xs">Search</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Gear className="w-6 h-6" />
                  <span className="text-xs">Settings</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <User className="w-6 h-6" />
                  <span className="text-xs">User</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <SignOut className="w-6 h-6" />
                  <span className="text-xs">Sign Out</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Share className="w-6 h-6" />
                  <span className="text-xs">Share</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Copy className="w-6 h-6" />
                  <span className="text-xs">Copy</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Info Icons</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex flex-col items-center gap-2">
                  <Path className="w-6 h-6" />
                  <span className="text-xs">Distance</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Clock className="w-6 h-6" />
                  <span className="text-xs">Time</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Calendar className="w-6 h-6" />
                  <span className="text-xs">Date</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Sun className="w-6 h-6" />
                  <span className="text-xs">Sun</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Moon className="w-6 h-6" />
                  <span className="text-xs">Moon</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Cloud className="w-6 h-6" />
                  <span className="text-xs">Cloud</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Mountains className="w-6 h-6" />
                  <span className="text-xs">Mountains</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Icon Sizes</h3>
              <div className="flex flex-wrap gap-6 items-end">
                <div className="flex flex-col items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  <span className="text-xs">w-3 h-3</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span className="text-xs">w-4 h-4</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  <span className="text-xs">w-5 h-5</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <MapPin className="w-6 h-6" />
                  <span className="text-xs">w-6 h-6</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <MapPin className="w-8 h-8" />
                  <span className="text-xs">w-8 h-8</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Day Card Example */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Day Card States</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                    <span className="text-lg font-bold text-primary">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Day 1</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Path className="w-3 h-3" />
                        45 mi
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        1h 15m
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Boot className="w-4 h-4 text-pinesoft" />
                  <Tent className="w-4 h-4 text-softamber" />
                  <Button variant="secondary" size="sm">
                    <NavigationArrow className="w-3 h-3 mr-1" />
                    Preview
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="ring-2 ring-primary border-primary">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground">
                    <span className="text-lg font-bold">2</span>
                  </div>
                  <div>
                    <p className="font-medium">
                      Day 2
                      <span className="ml-2 text-xs text-primary font-normal">(Previewing)</span>
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Path className="w-3 h-3" />
                        62 mi
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        1h 45m
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Boot className="w-4 h-4 text-pinesoft" />
                  <Tent className="w-4 h-4 text-softamber" />
                  <Button variant="secondary" size="sm">
                    <NavigationArrow className="w-3 h-3 mr-1" />
                    Exit Preview
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Spacing */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Spacing Scale</h2>
          <div className="space-y-4">
            {[1, 2, 3, 4, 6, 8, 10, 12, 16].map((size) => (
              <div key={size} className="flex items-center gap-4">
                <span className="w-12 text-sm text-muted-foreground">{size * 4}px</span>
                <div className={`h-4 bg-primary rounded`} style={{ width: `${size * 16}px` }}></div>
                <span className="text-sm">gap-{size}, p-{size}, m-{size}</span>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Border Radius */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Border Radius</h2>
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-primary rounded-sm"></div>
              <span className="text-xs">rounded-sm</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-primary rounded"></div>
              <span className="text-xs">rounded</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-primary rounded-md"></div>
              <span className="text-xs">rounded-md</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-primary rounded-lg"></div>
              <span className="text-xs">rounded-lg</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-primary rounded-xl"></div>
              <span className="text-xs">rounded-xl</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-primary rounded-full"></div>
              <span className="text-xs">rounded-full</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default StyleGuide;
