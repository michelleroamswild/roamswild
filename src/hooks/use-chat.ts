import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTrip } from '@/context/TripContext';

export interface TripSuggestion {
  name: string;
  duration: number;
  destinations: string[];
  activities?: string[];
  lodgingPreference?: string;
  pacePreference?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tripSuggestion?: TripSuggestion | null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTripSummary(tripConfig: any, generatedTrip: any): string | null {
  if (!tripConfig?.name && !generatedTrip) return null;

  const parts: string[] = [];

  if (tripConfig?.name) parts.push(`Trip: "${tripConfig.name}"`);
  if (tripConfig?.duration) parts.push(`${tripConfig.duration} days`);
  if (tripConfig?.startLocation?.name)
    parts.push(`Starting from: ${tripConfig.startLocation.name}`);

  if (tripConfig?.destinations?.length) {
    const names = tripConfig.destinations.map((d: any) => d.name.split(',')[0]);
    parts.push(`Destinations: ${names.join(' → ')}`);
  }

  if (tripConfig?.activities?.length)
    parts.push(`Activities: ${tripConfig.activities.join(', ')}`);
  if (tripConfig?.lodgingPreference)
    parts.push(`Lodging: ${tripConfig.lodgingPreference}`);
  if (tripConfig?.pacePreference)
    parts.push(`Pace: ${tripConfig.pacePreference}`);

  if (generatedTrip?.days?.length) {
    const hikeCount = generatedTrip.days.reduce(
      (sum: number, day: any) =>
        sum + (day.stops?.filter((s: any) => s.type === 'hike').length ?? 0),
      0
    );
    if (hikeCount > 0) parts.push(`${hikeCount} hikes planned`);
    parts.push(`${generatedTrip.days.length} day itinerary generated`);
  }

  return parts.join('. ');
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tripConfig, generatedTrip } = useTrip();

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        const allMessages = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const tripSummary = buildTripSummary(tripConfig, generatedTrip);

        const { data, error: fnError } = await supabase.functions.invoke(
          'chat-assistant',
          {
            body: {
              messages: allMessages,
              context: tripSummary ? { tripSummary } : undefined,
            },
          }
        );

        if (fnError) throw fnError;

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: data?.message ?? 'Sorry, something went wrong.',
          timestamp: Date.now(),
          tripSuggestion: data?.tripSuggestion ?? null,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send message';
        setError(msg);
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: "Sorry, I'm having trouble right now. Try again in a moment.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, tripConfig, generatedTrip]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearMessages };
}
