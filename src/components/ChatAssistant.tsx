import { useRef, useEffect, useState, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useChatContext } from '@/context/ChatContext';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ChatMessage, TripSuggestion } from '@/hooks/use-chat';
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

const STARTER_PROMPTS = [
  { icon: Compass, label: "What's a good hike for today?" },
  { icon: Mountains, label: 'Help me plan a trip' },
  { icon: Tent, label: 'Find a campsite near Moab' },
];

function InlineFormatted({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
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

function TripActionButton({ suggestion }: { suggestion: TripSuggestion }) {
  const navigate = useNavigate();
  const { setIsOpen } = useChatContext();

  const handleClick = () => {
    const params = new URLSearchParams();
    params.set('name', suggestion.name);
    params.set('duration', String(suggestion.duration));
    params.set('destinations', JSON.stringify(suggestion.destinations));
    if (suggestion.activities?.length)
      params.set('activities', JSON.stringify(suggestion.activities));
    if (suggestion.lodgingPreference)
      params.set('lodging', suggestion.lodgingPreference);
    if (suggestion.pacePreference)
      params.set('pace', suggestion.pacePreference);

    setIsOpen(false);
    navigate(`/create-trip?${params.toString()}`);
  };

  return (
    <button
      onClick={handleClick}
      className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
    >
      <RocketLaunch className="w-4 h-4" weight="fill" />
      Let's go!
    </button>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
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
          <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
            <SpinnerGap className="w-4 h-4 text-muted-foreground animate-spin" />
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
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Mountains className="w-6 h-6 text-primary" />
      </div>
      <h3 className="font-display font-semibold text-foreground mb-1">
        Hey! I'm Basecamp
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        Your trip planning assistant. What can I help with?
      </p>
      <div className="w-full space-y-2">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            onClick={() => sendMessage(prompt.label)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left"
          >
            <prompt.icon className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="text-sm text-foreground">{prompt.label}</span>
          </button>
        ))}
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
    <div className="border-t border-border px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything..."
          rows={1}
          className="flex-1 resize-none bg-muted rounded-xl px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity hover:bg-primary/90"
        >
          <PaperPlaneRight className="w-4 h-4" weight="fill" />
        </button>
      </div>
    </div>
  );
}

function ChatPanel() {
  const { messages, clearMessages } = useChatContext();
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
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

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          aria-label="Open chat assistant"
        >
          <ChatCircle className="w-7 h-7" weight="fill" />
        </button>
      )}

      {/* Desktop panel */}
      {!isMobile && isOpen && (
        <div className="fixed bottom-6 right-6 z-40 w-96 h-[calc(100vh-3rem)] rounded-2xl shadow-2xl bg-background border border-border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <Mountains className="w-5 h-5 text-primary" />
              <span className="font-display font-semibold text-foreground text-sm">
                Basecamp
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <ChatPanel />
        </div>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerContent className="h-[85dvh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Basecamp Chat</DrawerTitle>
            </DrawerHeader>
            <ChatPanel />
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
