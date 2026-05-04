import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Page-shape-aware skeletons that compose the base `Skeleton` block.
 * Match the most common surface shapes across the app so loading states
 * feel like they belong to the design system.
 */

export const SkeletonRow = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center gap-3 py-3", className)}>
    <Skeleton className="w-10 h-10 rounded-[10px] flex-shrink-0" />
    <div className="flex-1 min-w-0 space-y-1.5">
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="h-3 w-1/2 rounded" />
    </div>
  </div>
);

export const SkeletonCard = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "border border-line bg-white dark:bg-paper-2 rounded-[14px] p-4 space-y-2.5",
      className,
    )}
  >
    <Skeleton className="h-5 w-1/2 rounded" />
    <Skeleton className="h-4 w-full rounded" />
    <Skeleton className="h-4 w-2/3 rounded" />
  </div>
);

/** Day-card-shaped skeleton — header pill + meta row. */
export const SkeletonDayCard = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "border border-line bg-white dark:bg-paper-2 rounded-[14px] p-4",
      className,
    )}
  >
    <div className="flex items-center gap-3">
      <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-1/3 rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-3 w-12 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
      </div>
      <Skeleton className="h-7 w-20 rounded-full flex-shrink-0" />
    </div>
  </div>
);
