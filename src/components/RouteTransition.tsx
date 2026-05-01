import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

// View Transitions wrapper — only fires when navigating to/from the explore
// page since that's the only route with a meaningfully different header. For
// trips ↔ favorites and similar same-shell hops, the transition would add
// a 400ms delay and flash the sticky Header twice (it's already mounted on
// both sides), so we just let React swap content instantly.
//
// Browser support: Chrome/Edge/Safari TP. Falls back to instant swap on
// browsers without the API. The CSS that defines the fade lives in
// src/index.css under "View Transitions API".

interface RouteTransitionProps {
  children: ReactNode;
}

type ViewTransitionWindow = Window &
  typeof globalThis & {
    document: Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
  };

// Treat /dispersed as the "different shell" boundary. Crossing it triggers
// the crossfade; everything else is an instant swap.
const isShellBoundary = (from: string, to: string): boolean => {
  const fromExplore = from.startsWith('/dispersed');
  const toExplore = to.startsWith('/dispersed');
  return fromExplore !== toExplore;
};

export const RouteTransition = ({ children }: RouteTransitionProps) => {
  const location = useLocation();
  const [renderedChildren, setRenderedChildren] = useState(children);
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === previousPath.current) {
      setRenderedChildren(children);
      return;
    }
    const fromPath = previousPath.current;
    previousPath.current = location.pathname;

    const w = window as ViewTransitionWindow;
    if (
      isShellBoundary(fromPath, location.pathname) &&
      typeof w.document.startViewTransition === 'function'
    ) {
      w.document.startViewTransition(() => {
        setRenderedChildren(children);
      });
    } else {
      setRenderedChildren(children);
    }
  }, [location.pathname, children]);

  return <>{renderedChildren}</>;
};
