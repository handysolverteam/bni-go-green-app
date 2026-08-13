import React, { useState, useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';

export const ScrollToTopButton: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;

      if (currentScrollY > 150) {
        setIsVisible(true);

        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }

        hideTimerRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 3000);
      } else {
        setIsVisible(false);
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
      className={`fixed right-4 lg:bottom-6 lg:right-6 z-50 w-11 h-11 sm:w-12 sm:h-12 rounded-full btn-scroll-top backdrop-blur-xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 active:scale-95 ${
        isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      title="Go to top"
    >
      <ArrowUp className="w-6 h-6 stroke-[2.5]" />
    </button>
  );
};
