import { useRef, useEffect, useState, useCallback, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useChatContext } from '@/context/ChatContext';
import { useTrip } from '@/context/TripContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTripGenerator } from '@/hooks/use-trip-generator';
import type { ChatMessage, TripSuggestion } from '@/hooks/use-chat';
import type { TripDestination, TripConfig, ActivityType, LodgingType, PacePreference } from '@/types/trip';
import { getTripUrl } from '@/utils/slugify';
import { toast } from 'sonner';
import {
  ChatCircle,
  PaperPlaneRight,
  X,
  SpinnerGap,
  Mountains,
  Compass,
  Tent,
  RocketLaunch,
} from '@phosphor-icons/react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

const STARTER_PROMPTS: Array<{ icon: typeof Compass; label: string; accent: 'sage' | 'pine' | 'clay' }> = [
  { icon: Compass, label: "What's a good hike for today?", accent: 'sage' },
  { icon: Mountains, label: 'Help me plan a trip', accent: 'pine' },
  { icon: Tent, label: 'Find a campsite near Moab', accent: 'clay' },
];

const ACCENT_TONES: Record<'sage' | 'pine' | 'clay', { bg: string; text: string }> = {
  sage: { bg: 'bg-sage/15', text: 'text-sage' },
  pine: { bg: 'bg-pine-6/12', text: 'text-pine-6' },
  clay: { bg: 'bg-clay/15', text: 'text-clay' },
};

function InlineFormatted({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={i} />;
        if (/^[•\-\d+.]\s/.test(trimmed) || trimmed.startsWith('- ')) {
          const content = trimmed.replace(/^[•\-]\s*/, '').replace(/^\d+\.\s*/, '');
          return (
            <div key={i} className="flex gap-1.5 ml-1">
              <span className="flex-shrink-0">•</span>
              <span><InlineFormatted text={content} /></span>
            </div>
          );
        }
        return <p key={i}><InlineFormatted text={line} /></p>;
      })}
    </>
  );
}

async function geocodePlace(query: string): Promise<TripDestination | null> {
  if (!window.google?.maps?.places) return null;

  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.findPlaceFromQuery(
      { query, fields: ['place_id', 'name', 'formatted_address', 'geometry'] },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results?.[0]) {
          const place = results[0];
          resolve({
            id: place.place_id || `place-${Date.now()}`,
            placeId: place.place_id || '',
            name: place.name || query,
            address: place.formatted_address || query,
            coordinates: {
              lat: place.geometry!.location!.lat(),
              lng: place.geometry!.location!.lng(),
            },
          });
        } else {
          resolve(null);
        }
      },
    );
  });
}

function TripActionButton({ suggestion }: { suggestion: TripSuggestion }) {
  const navigate = useNavigate();
  const { setIsOpen } = useChatContext();
  const { setGeneratedTrip } = useTrip();
  const { generateTrip } = useTripGenerator();
  const [generating, setGenerating] = useState(false);

  const handleClick = useCallback(async () => {
    setGenerating(true);
    toast.loading('Generating your trip…', { id: 'chat-trip' });

    try {
      const geocoded = await Promise.all(suggestion.destinations.map((name) => geocodePlace(name)));
      const destinations = geocoded.filter((d): d is TripDestination => d !== null);

      if (destinations.length === 0) {
        toast.error("Couldn't find those destinations", { id: 'chat-trip' });
        setGenerating(false);
        return;
      }

      const startDest = destinations[0];
      const tripDestinations = destinations.slice(1).length > 0 ? destinations.slice(1) : destinations;

      const config: TripConfig = {
        name: suggestion.name,
        duration: suggestion.duration,
        startLocation: {
          id: startDest.id,
          placeId: startDest.placeId,
          name: startDest.name,
          address: startDest.address,
          coordinates: startDest.coordinates,
        },
        destinations: tripDestinations,
        returnToStart: false,
        activities: (suggestion.activities as ActivityType[]) ?? [],
        lodgingPreference: (suggestion.lodgingPreference as LodgingType) ?? 'dispersed',
        pacePreference: (suggestion.pacePreference as PacePreference) ?? 'moderate',
        hikingPreference: suggestion.activities?.includes('hiking') ? 'daily' : 'none',
      };

      const trip = await generateTrip(config);

      if (trip) {
        setGeneratedTrip(trip);
        toast.success('Trip created', { id: 'chat-trip', description: suggestion.name });
        setIsOpen(false);
        navigate(getTripUrl(trip.config.name));
      } else {
        toast.error('Trip generation failed', { id: 'chat-trip' });
      }
    } catch (err) {
      console.error('Chat trip generation error:', err);
      toast.error('Something went wrong', { id: 'chat-trip' });
    } finally {
      setGenerating(false);
    }
  }, [suggestion, generateTrip, setGeneratedTrip, setIsOpen, navigate]);

  return (
    <button
      onClick={handleClick}
      disabled={generating}
      className={cn(
        'mt-2 w-full flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-full bg-pine-6 text-cream dark:text-ink-pine border border-pine-6 text-[12px] font-sans font-semibold tracking-[0.01em]',
        'hover:bg-pine-5 hover:border-pine-5 transition-colors disabled:opacity-50',
      )}
    >
      {generating ? (
        <>
          <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
          Generating trip…
        </>
      ) : (
        <>
          <RocketLaunch className="w-3.5 h-3.5" weight="regular" />
          Let's go
        </>
      )}
    </button>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={cn(
          'max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[13px] leading-[1.55] font-sans',
          isUser
            ? 'bg-pine-6 text-cream dark:text-ink-pine rounded-br-[6px]'
            : 'bg-cream dark:bg-paper border border-line dark:border-line-2 text-ink rounded-bl-[6px]',
        )}
      >
        <FormattedText text={msg.content} />
      </div>
      {msg.tripSuggestion && (
        <div className="max-w-[85%] w-full mt-1">
          <TripActionButton suggestion={msg.tripSuggestion} />
        </div>
      )}
    </div>
  );
}

function ChatMessages() {
  const { messages, isLoading } = useChatContext();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}
      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-cream dark:bg-paper border border-line dark:border-line-2 rounded-[14px] rounded-bl-[6px] px-4 py-3">
            <SpinnerGap className="w-4 h-4 text-pine-6 animate-spin" />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function StarterPrompts() {
  const { sendMessage } = useChatContext();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-pine-6/10 flex items-center justify-center mb-3">
        <Mountains className="w-6 h-6 text-pine-6" weight="regular" />
      </div>
      <Mono className="text-pine-6 block">Basecamp</Mono>
      <h3 className="font-sans font-bold tracking-[-0.015em] text-[18px] text-ink mt-1">
        Hey! I'm your trip planner.
      </h3>
      <p className="text-[13px] text-ink-3 mt-1.5 max-w-[260px]">
        What can I help you plan today?
      </p>
      <div className="w-full space-y-2 mt-5">
        {STARTER_PROMPTS.map((prompt) => {
          const tone = ACCENT_TONES[prompt.accent];
          return (
            <button
              key={prompt.label}
              onClick={() => sendMessage(prompt.label)}
              className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[44px] rounded-[12px] border border-line dark:border-line-2 bg-white dark:bg-paper hover:border-ink-3/40 hover:bg-cream dark:hover:bg-paper-2 transition-colors text-left"
            >
              <div className={cn('w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0', tone.bg, tone.text)}>
                <prompt.icon className="w-4 h-4" weight="regular" />
              </div>
              <span className="text-[13px] font-sans text-ink leading-[1.4]">{prompt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatInput() {
  const { sendMessage, isLoading } = useChatContext();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  return (
    <div className="border-t border-line dark:border-line-2 bg-cream dark:bg-paper-2 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything…"
          rows={1}
          className="flex-1 resize-none bg-white dark:bg-paper border border-line dark:border-line-2 rounded-[12px] px-3 py-2.5 text-[14px] text-ink font-sans min-h-[40px] placeholder:text-ink-3 outline-none focus:border-pine-6 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="flex-shrink-0 w-10 h-10 rounded-[12px] bg-pine-6 text-cream dark:text-ink-pine flex items-center justify-center disabled:opacity-40 transition-colors hover:bg-pine-5"
          aria-label="Send"
        >
          <PaperPlaneRight className="w-4 h-4" weight="regular" />
        </button>
      </div>
    </div>
  );
}

function ChatPanel() {
  const { messages } = useChatContext();
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full bg-paper">
      {hasMessages ? <ChatMessages /> : <StarterPrompts />}
      <ChatInput />
    </div>
  );
}

export function ChatAssistant() {
  const { user } = useAuth();
  const { isOpen, setIsOpen } = useChatContext();
  const isMobile = useIsMobile();

  if (!user) return null;
  if (window.location.pathname.includes('-preview')) return null;

  return (
    <>
      {/* Floating button — text-cream stays light in both modes; in dark mode flip
          to ink-pine so the icon stays legible against the lightened pine-6. */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            'fixed bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.5rem))] right-4 sm:right-6 z-40',
            'w-14 h-14 rounded-full bg-pine-6 text-cream dark:text-ink-pine',
            'shadow-[0_10px_28px_rgba(58,74,42,.32)] hover:shadow-[0_14px_36px_rgba(58,74,42,.40)] hover:bg-pine-5 hover:scale-[1.04]',
            'transition-all flex items-center justify-center',
          )}
          aria-label="Open chat assistant"
        >
          <ChatCircle className="w-7 h-7" weight="fill" />
        </button>
      )}

      {/* Desktop panel */}
      {!isMobile && isOpen && (
        <div className="fixed bottom-6 right-6 z-40 w-96 max-h-[600px] h-[calc(100vh-8rem)] rounded-[18px] shadow-[0_24px_56px_rgba(29,34,24,.20),0_4px_12px_rgba(29,34,24,.10)] bg-paper border border-line dark:border-line-2 flex flex-col overflow-hidden font-sans">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-2 bg-cream dark:bg-paper-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-[8px] bg-pine-6/12 text-pine-6 flex items-center justify-center flex-shrink-0">
                <Mountains className="w-4 h-4" weight="regular" />
              </div>
              <div className="min-w-0">
                <Mono className="text-pine-6 block leading-none">Basecamp</Mono>
                <span className="text-[11px] text-ink-3 mt-0.5 block leading-none">Trip planning chat</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
            >
              <X className="w-4 h-4" weight="regular" />
            </button>
          </div>
          <ChatPanel />
        </div>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerContent className="h-[85dvh] max-h-[85dvh] bg-paper border-line dark:border-line-2">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Basecamp Chat</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 flex flex-col overflow-hidden pb-safe font-sans">
              <ChatPanel />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
