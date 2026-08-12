import React, { useState, useEffect } from 'react';
import { Download, X, Share, Smartphone } from 'lucide-react';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already in standalone PWA mode
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

    // If iOS and not standalone, show iOS install guide after short delay
    const dismissed = localStorage.getItem('bni_pwa_prompt_dismissed');
    if (iosDevice && !inStandalone && !dismissed) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
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

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('bni_pwa_prompt_dismissed', 'true');
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-fadeIn">
      <div className="p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/40 text-white shadow-2xl backdrop-blur-xl space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white">Install BNI Go Green App</h4>
              <p className="text-xs text-slate-400">Add to your home screen for quick access & score tracking</p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Share className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>To install on iOS:</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Tap the <strong className="text-white">Share</strong> button at bottom of Safari & select <strong className="text-white">'Add to Home Screen'</strong>.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Not now
            </button>
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
