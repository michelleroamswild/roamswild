import { useState, useEffect } from 'react';
import { Clock, User, MapPin, Boot, Tent, Plus, Trash, ArrowsClockwise, Users } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';

interface ActivityEntry {
  id: string;
  action: string;
  details: {
    stopName?: string;
    dayNumber?: number;
    permission?: string;
    collaboratorEmail?: string;
    [key: string]: any;
  } | null;
  createdAt: string;
  userName?: string;
}

interface TripActivityLogProps {
  tripId: string;
  maxHeight?: string;
}

const getActivityIcon = (action: string) => {
  switch (action) {
    case 'added_stop':
      return Plus;
    case 'removed_stop':
      return Trash;
    case 'swapped_hike':
      return ArrowsClockwise;
    case 'added_collaborator':
    case 'removed_collaborator':
      return Users;
    default:
      return Clock;
  }
};

const getActivityMessage = (activity: ActivityEntry): string => {
  const details = activity.details || {};

  switch (activity.action) {
    case 'added_stop':
      return `Added "${details.stopName}" to Day ${details.dayNumber}`;
    case 'removed_stop':
      return `Removed "${details.stopName}" from Day ${details.dayNumber}`;
    case 'swapped_hike':
      return `Changed hike to "${details.stopName}" on Day ${details.dayNumber}`;
    case 'added_collaborator':
      return `Invited ${details.collaboratorEmail} with ${details.permission} access`;
    case 'removed_collaborator':
      return `Removed ${details.collaboratorEmail} from trip`;
    case 'updated_permission':
      return `Changed ${details.collaboratorEmail}'s access to ${details.permission}`;
    case 'trip_created':
      return 'Created this trip';
    case 'trip_saved':
      return 'Saved trip changes';
    default:
      return activity.action.replace(/_/g, ' ');
  }
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export function TripActivityLog({ tripId, maxHeight = '300px' }: TripActivityLogProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const { data, error } = await supabase
          .from('trip_activity')
          .select(`
            id,
            action,
            details,
            created_at,
            user_id
          `)
          .eq('trip_id', tripId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.error('Error fetching activities:', error);
          return;
        }

        if (data) {
          // Fetch user names for each activity
          const userIds = [...new Set(data.map(a => a.user_id).filter(Boolean))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', userIds);

          const profileMap = new Map(profiles?.map(p => [p.id, p.name]) || []);

          const formattedActivities: ActivityEntry[] = data.map(a => ({
            id: a.id,
            action: a.action,
            details: a.details as ActivityEntry['details'],
            createdAt: a.created_at,
            userName: profileMap.get(a.user_id) || 'Unknown',
          }));

          setActivities(formattedActivities);
        }
      } catch (err) {
        console.error('Error fetching activities:', err);
      }

      setLoading(false);
    };

    fetchActivities();
  }, [tripId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading activity...</div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No activity yet</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ maxHeight }}>
          <div className="divide-y divide-border">
            {activities.map((activity) => {
              const Icon = getActivityIcon(activity.action);

              return (
                <div key={activity.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{activity.userName}</span>{' '}
                      {getActivityMessage(activity).toLowerCase()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatRelativeTime(activity.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Helper function to log activity (call from context or components)
export async function logTripActivity(
  tripId: string,
  userId: string,
  action: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    await supabase.from('trip_activity').insert({
      trip_id: tripId,
      user_id: userId,
      action,
      details,
    });
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}
