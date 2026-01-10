import { TripDay, TripStop } from '@/types/trip';

interface DayTimeEstimate {
  totalHours: number;
  drivingHours: number;
  hikingHours: number;
  hikeCount: number;
  isOverloaded: boolean;
  warningMessage: string | null;
}

// Parse duration strings like "2-4h hike", "45 min", "1h 30m", "2 hours"
function parseDurationToMinutes(duration: string): number {
  if (!duration) return 0;

  const lower = duration.toLowerCase();

  // Handle range format like "2-4h" - use the higher value
  const rangeMatch = lower.match(/(\d+)-(\d+)\s*h/);
  if (rangeMatch) {
    return parseInt(rangeMatch[2], 10) * 60;
  }

  // Handle "Xh Ym" format
  const hourMinMatch = lower.match(/(\d+)\s*h\s*(\d+)\s*m/);
  if (hourMinMatch) {
    return parseInt(hourMinMatch[1], 10) * 60 + parseInt(hourMinMatch[2], 10);
  }

  // Handle "X hours" or "Xh"
  const hourMatch = lower.match(/(\d+)\s*h/);
  if (hourMatch) {
    return parseInt(hourMatch[1], 10) * 60;
  }

  // Handle "X min" or "X minutes"
  const minMatch = lower.match(/(\d+)\s*min/);
  if (minMatch) {
    return parseInt(minMatch[1], 10);
  }

  return 0;
}

// Parse driving time strings like "15 min each way", "1h 30m"
function parseDrivingTimeToMinutes(drivingTime: string): number {
  if (!drivingTime) return 0;

  const lower = drivingTime.toLowerCase();

  // Handle "each way" - double the time
  const isEachWay = lower.includes('each way');
  let minutes = parseDurationToMinutes(drivingTime);

  if (isEachWay) {
    minutes *= 2;
  }

  return minutes;
}

export function estimateDayTime(day: TripDay): DayTimeEstimate {
  const hikes = day.stops.filter(s => s.type === 'hike');
  const hikeCount = hikes.length;

  // Calculate total hiking time
  let hikingMinutes = 0;
  hikes.forEach(hike => {
    hikingMinutes += parseDurationToMinutes(hike.duration);
  });

  // Calculate driving time from day's total + individual stop driving times
  let drivingMinutes = parseDurationToMinutes(day.drivingTime);

  // Add individual hike driving times if available
  hikes.forEach(hike => {
    if (hike.drivingTime) {
      drivingMinutes += parseDrivingTimeToMinutes(hike.drivingTime);
    }
  });

  const totalMinutes = hikingMinutes + drivingMinutes;
  const totalHours = totalMinutes / 60;
  const drivingHours = drivingMinutes / 60;
  const hikingHours = hikingMinutes / 60;

  // Determine if day is overloaded
  // Consider a day overloaded if:
  // - Total activity time exceeds 10 hours, OR
  // - Has 2+ hikes and total time exceeds 8 hours
  let isOverloaded = false;
  let warningMessage: string | null = null;

  if (hikeCount >= 2) {
    if (totalHours > 8) {
      isOverloaded = true;
      warningMessage = `This day has ${hikeCount} hikes with ~${Math.round(totalHours)} hours of activities. Consider splitting across multiple days.`;
    } else if (totalHours > 6) {
      // Soft warning for busy days
      warningMessage = `This day has ${hikeCount} hikes. Make sure to start early!`;
    }
  } else if (totalHours > 10) {
    isOverloaded = true;
    warningMessage = `This day has ~${Math.round(totalHours)} hours of activities and driving. It might be too ambitious.`;
  }

  return {
    totalHours,
    drivingHours,
    hikingHours,
    hikeCount,
    isOverloaded,
    warningMessage,
  };
}

// Check if adding a new hike would overload the day
export function wouldOverloadDay(day: TripDay, newHike: TripStop): boolean {
  const currentEstimate = estimateDayTime(day);
  const newHikeDuration = parseDurationToMinutes(newHike.duration);
  const newDrivingTime = parseDrivingTimeToMinutes(newHike.drivingTime || '');

  const newTotalHours = currentEstimate.totalHours + (newHikeDuration + newDrivingTime) / 60;
  const newHikeCount = currentEstimate.hikeCount + 1;

  // Would be overloaded if:
  // - 2+ hikes and total > 8 hours
  // - Any day > 10 hours
  if (newHikeCount >= 2 && newTotalHours > 8) return true;
  if (newTotalHours > 10) return true;

  return false;
}
