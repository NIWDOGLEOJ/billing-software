import { Outlet, Navigate } from 'react-router';
import { Suspense, lazy, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { SectorNav } from './sector-nav';
import { E2EEChatbox } from './ui/e2ee-chatbox';
import { toast } from 'sonner';
import { useWebSocket } from '../hooks/useWebSocket';
import { KioskLockOverlay } from './ui/kiosk-lock-overlay';
import { isMobileDevice } from '../lib/device';

// Lazy load settings to optimize initial page loading
const POSSettings = lazy(() => import('./pos-settings').then((m) => ({ default: m.POSSettings })));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[60vh] gap-4 bg-[var(--surface)]">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-[var(--primary-accent)]/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--primary-accent)] animate-spin" />
      </div>
      <p className="text-sm font-medium text-[var(--text-muted)]">Loading...</p>
    </div>
  );
}

// Migrate existing Evalix settings to NexusFlow if needed
const getMigratedKey = (key: string, defaultVal: string): string => {
  try {
    const nexusKey = `nexusflow${key}`;
    const evalixKey = `evalix${key}`;
    const value = localStorage.getItem(nexusKey);
    if (value !== null) return value;

    // Fallback and migrate old key
    const oldVal = localStorage.getItem(evalixKey);
    if (oldVal !== null) {
      localStorage.setItem(nexusKey, oldVal);
      return oldVal;
    }
  } catch {
    // Storage unreadable — callers get the default
  }
  return defaultVal;
};

export function Layout() {
  const { user, isAuthenticated, logout, currentSession, isOnBreak, startBreak } = useAuth();
  const [isKioskLocked, setIsKioskLocked] = useState(false);
  const { darkMode, showSettings, setShowSettings } = useTheme();
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const [chatEnabled, setChatEnabled] = useState<boolean>(() => {
    return getMigratedKey('ChatEnabled', 'true') !== 'false';
  });

  // 🔒 Kiosk Immersive Mode Fullscreen Monitoring (Desktop counters only)
  useEffect(() => {
    if (
      isMobileDevice() ||
      !isAuthenticated ||
      user?.username === 'developer' ||
      user?.role === 'owner' ||
      user?.role === 'co-owner'
    ) {
      setIsKioskLocked(false);
      return;
    }

    const checkFullscreen = () => {
      if (isMobileDevice()) {
        setIsKioskLocked(false);
        return;
      }
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      // If not on break and not fullscreen, lock it!
      if (!isFs && !isOnBreak) {
        setIsKioskLocked(true);
      } else {
        setIsKioskLocked(false);
      }
    };

    checkFullscreen();

    const handleResize = () => {
      if (isMobileDevice()) {
        setIsKioskLocked(false);
      } else {
        checkFullscreen();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      document.removeEventListener('mozfullscreenchange', checkFullscreen);
      document.removeEventListener('MSFullscreenChange', checkFullscreen);
    };
  }, [isAuthenticated, user, isOnBreak]);

  const handleRestoreFullscreen = useCallback(async () => {
    if (isMobileDevice()) {
      setIsKioskLocked(false);
      return;
    }

    try {
      const el = document.documentElement;
      const req =
        el.requestFullscreen ||
        (el as any).webkitRequestFullscreen ||
        (el as any).mozRequestFullScreen ||
        (el as any).msRequestFullscreen;
      if (typeof req === 'function') {
        const p = req.call(el);
        if (p && typeof p.catch === 'function') {
          await p.catch(() => {});
        }
      }
      setIsKioskLocked(false);
    } catch (err) {
      console.warn('[Kiosk Immersive Mode] Fullscreen auto-restoration deferred:', err);
      setIsKioskLocked(false);
    }
  }, []);

  // Listen to setting updates in workspace profiles
  useEffect(() => {
    const handleProfileSync = () => {
      try {
        const chatSetting = localStorage.getItem('nexusflowChatEnabled');
        setChatEnabled(chatSetting !== 'false');
      } catch {
        // Profile sync is best-effort
      }
    };

    window.addEventListener('nexusflow-profile-updated', handleProfileSync);
    return () => window.removeEventListener('nexusflow-profile-updated', handleProfileSync);
  }, []);

  // Synchronize unread E2EE chat count from custom window events
  useEffect(() => {
    const handleUnreadUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      setUnreadChatCount(customEvent.detail?.count || 0);
    };
    window.addEventListener('chat-unread-updated', handleUnreadUpdate);
    return () => window.removeEventListener('chat-unread-updated', handleUnreadUpdate);
  }, []);

  // Real-time login session invalidation
  useWebSocket({
    SESSION_INVALIDATED: (data: any) => {
      if (data && currentSession && currentSession.id === data.sessionId) {
        toast.error('Your session has been terminated because you logged in from another device/register.', {
          duration: 10000,
          position: 'top-center',
        });
        logout();
      }
    },
  });

  // /config is now a full-screen route; no redirect needed here.

  // Lock parent/body scrolling when settings modal is open to prevent background leak
  useEffect(() => {
    if (showSettings) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [showSettings]);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)] px-0">
      <SectorNav
        unreadChats={unreadChatCount}
        onOpenChat={() => window.dispatchEvent(new CustomEvent('toggle-e2ee-chat'))}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative min-w-0">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>

        {/* Unified Settings Modal */}
        {showSettings && (
          <Suspense fallback={null}>
            <POSSettings isModal={true} onClose={() => setShowSettings(false)} />
          </Suspense>
        )}
      </main>

      {/* Client-Side End-to-End Encrypted LAN Chatbox Drawer */}
      {chatEnabled && <E2EEChatbox />}

      {isKioskLocked && (
        <KioskLockOverlay
          onRestore={handleRestoreFullscreen}
          onBreak={startBreak}
          onLogout={logout}
          darkMode={darkMode}
        />
      )}

      {/* Subtle brand label at the bottom */}
      <footer className="h-4 px-3 flex items-center justify-end shrink-0 pointer-events-none select-none">
        <span className="font-mono text-[9px] tracking-wider uppercase font-bold" style={{ color: 'var(--ink4)', opacity: 0.3 }}>
          j mart pos
        </span>
      </footer>
    </div>
  );
}
