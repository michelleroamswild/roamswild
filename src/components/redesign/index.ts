// 2026 Redesign primitives — Pine + Paper.
// Use these instead of the legacy shadcn variants for new redesign surfaces.
// Legacy components keep working until each page is migrated.

export { Mono } from './Mono';
export type { MonoProps } from './Mono';

export { Pill } from './Pill';
export type { PillProps, PillVariant } from './Pill';

export { Tag } from './Tag';
export type { TagProps } from './Tag';

export { StatusDot } from './StatusDot';
export type { StatusDotProps, StatusKind } from './StatusDot';

export { TopoBg } from './TopoBg';
export type { TopoBgProps } from './TopoBg';

export { AuthSidePanel, AuthInput } from './AuthLayout';

// Tier 1 + 2 composition primitives
export { Surface } from './Surface';
export type { SurfaceProps, SurfaceVariant, SurfacePadding } from './Surface';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateAccent } from './EmptyState';

export { StatCard } from './StatCard';
export type { StatCardProps, StatCardAccent } from './StatCard';

export { Field } from './Field';
export type { FieldProps } from './Field';

export { Banner } from './Banner';
export type { BannerProps, BannerTone } from './Banner';

export { SegmentedControl } from './SegmentedControl';
export type {
  SegmentedControlProps,
  SegmentedControlOption,
} from './SegmentedControl';

export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize, SpinnerTone } from './Spinner';

export { DismissibleTag } from './DismissibleTag';
export type { DismissibleTagProps } from './DismissibleTag';

export { SkeletonRow, SkeletonCard, SkeletonDayCard } from './Skeletons';
