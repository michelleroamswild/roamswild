import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Compass, ArrowLeft } from '@phosphor-icons/react';
import { Mono, TopoBg } from '@/components/redesign';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-cream text-ink font-sans relative flex items-center justify-center px-6 overflow-hidden">
      <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />

      <div className="relative max-w-[440px] text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 text-pine-6 mb-5">
          <Compass className="w-6 h-6" weight="regular" />
        </div>
        <Mono className="text-pine-6">Lost in the woods</Mono>
        <h1 className="font-sans font-bold tracking-[-0.04em] leading-[0.94] text-[80px] md:text-[112px] m-0 mt-3 text-ink">
          404
        </h1>
        <p className="text-lg md:text-[19px] leading-[1.55] text-ink-3 mt-5">
          We couldn't find that page. Try heading back to the map.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine-6 text-cream text-[14px] font-sans font-semibold hover:bg-pine-5 transition-colors shadow-[0_1px_2px_rgba(29,34,24,.08)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
