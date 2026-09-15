import React, { useState, useEffect } from 'react';
import { PlusCircle, X, Share, Smartphone, Laptop } from 'lucide-react';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // Check if already in standalone PWA or installed mode
    const inStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone ||
      document.referrer.includes('android-app://');

    setIsStandalone(inStandalone);
    if (inStandalone) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    const dismissed = localStorage.getItem('bni_pwa_prompt_dismissed');
    if (!inStandalone && !dismissed) {
      const timer = setTimeout(() => setShowPrompt(true), 2500);
      return () => clearTimeout(timer);
    }

    // Android & Desktop Chrome beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!dismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleAddClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // Toggle guide if browser needs manual Add to Home Screen step (iOS / Safari / Firefox)
      setShowGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('bni_pwa_prompt_dismissed', 'true');
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
      className="fixed left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-fadeIn"
    >
      <div className="p-4 rounded-3xl bg-slate-900/95 border border-emerald-500/40 text-white shadow-2xl backdrop-blur-2xl space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full bg-[#001D39] rounded-[14px] flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <h4 className="text-sm font-black text-white">Add to Home Screen</h4>
              <p className="text-[11px] text-slate-400">Quick 1-tap access for score tracking & nudges</p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Guide for iOS / Manual Browsers */}
        {(isIOS || showGuide) && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1.5 animate-fadeIn">
            <div className="flex items-center gap-1.5 font-extrabold text-white">
              <Share className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>How to Add to Home Screen:</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Tap <strong className="text-white font-bold">Share</strong> or <strong className="text-white font-bold">Menu (⋮)</strong> in your browser, then select <strong className="text-emerald-400 font-black">'Add to Home Screen'</strong>.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 pt-1">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleAddClick}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
          >
            <PlusCircle className="w-4 h-4 text-slate-950" />
            <span>Add to Home Screen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
