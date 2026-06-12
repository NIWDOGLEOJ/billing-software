import { ShieldAlert, RefreshCw, Coffee, LogOut, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface KioskLockOverlayProps {
  onRestore: () => void;
  onBreak: () => Promise<void>;
  onLogout: () => Promise<void>;
  darkMode: boolean;
}

export function KioskLockOverlay({ onRestore, onBreak, onLogout, darkMode }: KioskLockOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(5);

  // Auto-restore fullscreen after 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onRestore();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onRestore]);

  // Prevent any keydown event from bypassing the overlay while it is active
  useEffect(() => {
    const blockInteractionKeys = (e: KeyboardEvent) => {
      // Allow only Enter or Space on active elements to trigger buttons if needed, otherwise block
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('keydown', blockInteractionKeys, true);
    return () => {
      window.removeEventListener('keydown', blockInteractionKeys, true);
    };
  }, []);

  return (
    <div 
      onClick={onRestore}
      title="Click anywhere on backdrop to restore fullscreen"
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-2xl cursor-pointer ${
        darkMode 
          ? 'bg-gray-955/95 text-white' 
          : 'bg-gray-900/90 text-white'
      } transition-all duration-500 overflow-hidden`}
    >
      
      {/* Background glowing ambient light blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Main glass container */}
      <div 
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside the card from triggering background fullscreen restore
        className={`relative w-full max-w-lg p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md transition-all duration-700 bg-white/5 cursor-default`}
      >
        
        {/* Animated Scanner Radar Header */}
        <div className="flex flex-col items-center text-center mb-8 relative">
          <div className="relative flex items-center justify-center w-24 h-24 mb-6">
            {/* Pulsing ring */}
            <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping opacity-75" />
            <div className="absolute inset-2 rounded-full bg-indigo-500/10 animate-pulse" />
            
            {/* Glowing Lock Container */}
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-red-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/20 hover:scale-105 transition-transform duration-300">
              <Lock size={28} className="text-white animate-bounce" />
            </div>
            
            {/* Scanner line scanning vertically */}
            <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse" style={{ top: '50%' }} />
          </div>

          <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-400 bg-red-950/40 border border-red-800/60 rounded-full mb-3 flex items-center gap-1.5 animate-pulse">
            <ShieldAlert size={12} />
            Kiosk Lockdown Compliance Active
          </span>
          
          <h2 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            Terminal Locked
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
            NexusFlow Cashier Dashboard operates strictly inside an immersive containers state. Exit from fullscreen requires terminal authorization or break logs.
          </p>
        </div>

        {/* Content details & Instructions */}
        <div className="space-y-4 mb-8">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-400 leading-relaxed">
            <p className="mb-2">⚠️ <strong className="text-gray-200">Security Rule Enforcement:</strong></p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Direct desktop access and external browser controls are suspended.</li>
              <li>Unauthorized exits trigger strict kiosk overlays blocking checkout actions.</li>
              <li>To resume transactions, restore the immersive fullscreen view below.</li>
              <li className="text-indigo-400 font-semibold list-none mt-2">💡 Quick Restore: Simply click or tap anywhere on the dark screen background to instantly return to immersive mode!</li>
            </ul>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          {/* Primary Restore Button */}
          <button
            onClick={onRestore}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 hover:from-blue-600 hover:via-indigo-700 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transform hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
            Restore Immersive Fullscreen {timeLeft > 0 ? `(${timeLeft}s)` : ''}
          </button>

          {/* Secondary Logout & Break Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              onClick={onBreak}
              className="py-3 px-4 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 hover:border-orange-500/50 text-orange-200 hover:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <Coffee size={16} />
              Start Break
            </button>
            <button
              onClick={onLogout}
              className="py-3 px-4 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 hover:border-red-500/50 text-red-200 hover:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <LogOut size={16} />
              Log Out Cashier
            </button>
          </div>
        </div>

        {/* Brand stamp footer */}
        <div className="mt-8 text-center text-[10px] text-gray-500 tracking-wider uppercase font-semibold select-none">
          NexusFlow System • Immersive Container Auth 1.0.4
        </div>
      </div>
    </div>
  );
}
