import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setToken, clearToken } from '../utils/api';

export type Permission =
  | 'access_billing'
  | 'edit_product_price'
  | 'delete_bill_items'
  | 'apply_discounts'
  | 'view_analytics'
  | 'access_inventory'
  | 'view_transaction_history'
  | 'generate_reports'
  | 'access_settings'
  | 'manage_employees';

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: 'owner' | 'co-owner' | 'employee';
  permissions: Permission[];
  phone?: string;
  createdAt: string;
  isActive: boolean;
}

export interface LoginSession {
  id: string;
  userId: string;
  loginTime: string;
  logoutTime?: string;
  duration?: number;
}

export interface BreakRecord {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  duration?: number;
}

export interface ShiftRecord {
  id: string;
  user_id: string;
  user_name: string;
  start_time: string;
  end_time?: string;
  initial_cash: number;
  system_cash: number;
  system_upi: number;
  system_card: number;
  actual_cash?: number;
  actual_upi?: number;
  actual_card?: number;
  discrepancy_cash: number;
  status: 'active' | 'closed';
  notes?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string, rememberDevice?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  activeShift: ShiftRecord | null;
  startShift: (initialCash: number) => Promise<void>;
  endShift: (actualCash: number, actualUpi: number, actualCard: number, notes?: string) => Promise<ShiftRecord>;
  hasPermission: (permission: Permission) => boolean;
  isOwner: () => boolean;
  currentSession: LoginSession | null;
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
  isOnBreak: boolean;
  currentBreak: BreakRecord | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentSession, setCurrentSession] = useState<LoginSession | null>(null);
  const [currentBreak, setCurrentBreak] = useState<BreakRecord | null>(null);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);

  // Initialize auth state from localStorage and listen for token expiration events
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    const savedSession = localStorage.getItem('currentSession');
    const savedBreak = localStorage.getItem('currentBreak');
    const savedIsOnBreak = localStorage.getItem('isOnBreak') === 'true';
    const savedShift = localStorage.getItem('activeShift');
    const savedToken = localStorage.getItem('authToken');

    // Persist session if we have a valid auth token
    if (savedToken) {
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      if (savedSession) {
        setCurrentSession(JSON.parse(savedSession));
      }
      if (savedBreak) {
        setCurrentBreak(JSON.parse(savedBreak));
      }
      if (savedShift) {
        setActiveShift(JSON.parse(savedShift));
      }
      setIsOnBreak(savedIsOnBreak);
    } else {
      // Clear any remaining fragments to ensure a clean state
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentSession');
      localStorage.removeItem('currentBreak');
      localStorage.removeItem('isOnBreak');
      localStorage.removeItem('activeShift');
      localStorage.removeItem('authToken');
      setUser(null);
    }

    const handleAuthExpired = () => {
      setUser(null);
      setCurrentSession(null);
      setCurrentBreak(null);
      setIsOnBreak(false);
      setActiveShift(null);
    };

    window.addEventListener('auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, []);

  // Auto-logout after 8 hours of inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (user) {
          logout();
        }
      }, 8 * 60 * 60 * 1000); // 8 hours
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetTimeout();

    events.forEach(event => {
      document.addEventListener(event, handler);
    });

    resetTimeout();

    return () => {
      clearTimeout(timeout);
      events.forEach(event => {
        document.removeEventListener(event, handler);
      });
    };
  }, [user]);

  // 🛡️ Screenshot & Print Security Protocol (Restricted to Developer Exemption)
  useEffect(() => {
    // 1. Intercept print and capture keyboard keys heuristic
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is developer, they are completely exempted from all kiosk restrictions and screenshot blackouts
      if (user?.username === 'developer') {
        return;
      }

      // Print command intercept
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
      }
      
      // PrintScreen key down (instantly blur body before OS reads pixels)
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        document.body.classList.add('blurred-screen');
        setTimeout(() => document.body.classList.remove('blurred-screen'), 1500);
      }

      // Heuristic: OS capture shortcut combinations (Cmd/Win + Shift + 3/4/5/S)
      const isCmdOrWin = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();
      
      if (isCmdOrWin && isShift && (key === '3' || key === '4' || key === '5' || key === 's')) {
        // Instantly blur screen to secure framebuffer before OS captures it
        document.body.classList.add('blurred-screen');
        // Keep blurred for a second and a half to ensure capture has passed
        setTimeout(() => {
          document.body.classList.remove('blurred-screen');
        }, 1500);
      }

      // 🖥️ Kiosk mode key restrictions (if user is logged in and not developer/owner/co-owner)
      if (user && user.role !== 'owner' && user.role !== 'co-owner') {
        // Prevent system/browser-level full screen exit via F11
        if (e.key === 'F11') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Prevent devtools (F12, Ctrl+Shift+I, Cmd+Opt+I, Ctrl+Shift+J, Cmd+Opt+J)
        const isIorJ = key === 'i' || key === 'j';
        if (
          e.key === 'F12' ||
          (isCmdOrWin && isShift && isIorJ) ||
          (isCmdOrWin && e.altKey && isIorJ)
        ) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Prevent browser reloads (F5, Ctrl+R, Cmd+R, Ctrl+Shift+R, Cmd+Shift+R)
        if (
          e.key === 'F5' ||
          (isCmdOrWin && key === 'r')
        ) {
          // Allow billing F5 "New Bill" intercept, but stop default browser reload action
          e.preventDefault();
        }

        // Prevent opening new tabs/windows or closing them (Ctrl/Cmd + T, W)
        if (isCmdOrWin && (key === 't' || key === 'w')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Validate if this key/combination is allowed in the billing system
        const isAllowedKey = (ev: KeyboardEvent): boolean => {
          // Allow single character typing for inputs, barcodes, numbers, etc.
          if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
            return true;
          }

          // Allow essential system/editing/navigation control keys
          const allowedControlKeys = [
            'Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'Space',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown',
            'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'
          ];
          if (allowedControlKeys.includes(ev.key)) {
            return true;
          }

          // Allow specific billing function keys (F1, F2, F3, F4, F5, F6)
          // Exclude F11 and F12 as they were already handled and blocked above
          const allowedFuncKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
          if (allowedFuncKeys.includes(ev.key)) {
            return true;
          }

          // Allow specific Ctrl/Cmd combos required by billing system features
          if (ev.ctrlKey || ev.metaKey) {
            const allowedCtrlCombos = ['s', 'h', 'n', 'f', 'p', 'c', 'v', 'x', 'a', 'z', 'y'];
            if (allowedCtrlCombos.includes(ev.key.toLowerCase())) {
              return true;
            }
          }

          return false;
        };

        // If the key is not in the allowed list, block it!
        if (!isAllowedKey(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    // 2. Dynamic Blur when tab focus is lost (Snipping tools / Screen capture triggers focus loss)
    const handleBlur = () => {
      if (user && user.username !== 'developer') {
        document.body.classList.add('blurred-screen');
      }
    };
    const handleFocus = () => {
      document.body.classList.remove('blurred-screen');
    };

    window.addEventListener('keydown', handleKeyDown, true); // Enforce at capture phase for maximum lockdown authority
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.body.classList.remove('blurred-screen'); // Safety clean
    };
  }, [user]);

  // 📡 Dynamic Native Android WebView FLAG_SECURE Bridge
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const androidObj = (window as any).Android;
      if (androidObj && typeof androidObj.setSecureFlags === 'function') {
        try {
          const isDev = user?.username === 'developer';
          androidObj.setSecureFlags(!isDev); // Enforce secure flags (blocking screenshots) for everyone EXCEPT developer
          console.log(`[Android Secure Bridge] FlagSecure set to: ${!isDev}`);
        } catch (err) {
          console.error('[Android Secure Bridge] Failed to execute setSecureFlags on Android interface:', err);
        }
      }
    }
  }, [user]);

  // Periodic Active Session Keep-Alive Heartbeat (every 30 seconds)
  useEffect(() => {
    if (!currentSession) return;

    const sendHeartbeat = async () => {
      try {
        await api.post('/auth/heartbeat', { sessionId: currentSession.id });
      } catch (err) {
        console.warn('[HEARTBEAT] Keep-alive failed:', err);
      }
    };

    // Send initial heartbeat immediately
    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [currentSession]);

  // Synchronous Unload / Tab Close Session termination (using keepalive fetch)
  useEffect(() => {
    if (!currentSession) return;

    const handleUnload = () => {
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch('/api/auth/logout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: currentSession.id }),
        keepalive: true
      }).catch(e => console.error('Keepalive unload logout failed:', e));
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [currentSession]);

  const login = async (
    username: string,
    password: string,
    rememberDevice = false,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const res = await api.post<{ token: string; user: any }>('/auth/login', { 
        username, 
        password,
        deviceType: isMobile ? 'mobile' : 'desktop'
      });
      
      setToken(res.token);

      const parsedUser: User = {
        id: res.user.id,
        username: res.user.username,
        email: res.user.email || '',
        name: res.user.name,
        role: res.user.role,
        permissions: res.user.permissions || [],
        phone: res.user.phone || '',
        createdAt: res.user.created_at || new Date().toISOString(),
        isActive: true
      };

      const session: LoginSession = {
        id: res.user.sessionId,
        userId: res.user.id,
        loginTime: new Date().toISOString(),
      };

      setUser(parsedUser);
      setCurrentSession(session);

      // Always store user and session details in localStorage to ensure the active session remains
      // rock-solid across page refreshes, tab reloads, and redirects.
      localStorage.setItem('currentUser', JSON.stringify(parsedUser));
      localStorage.setItem('currentSession', JSON.stringify(session));

      // Developer exception: reset onboarding flags to allow switching profiles easily on login
      if (parsedUser.username === 'developer') {
        localStorage.removeItem('nexusflowOnboarded');
        localStorage.removeItem('nexusflowSector');
        localStorage.removeItem('nexusflowMultiSectorEnabled');
        localStorage.removeItem('evalixOnboarded');
        localStorage.removeItem('evalixSector');
        localStorage.removeItem('evalixMultiSectorEnabled');
      }

      // Check if there is an active break in localStorage for this user
      const savedBreak = localStorage.getItem('currentBreak');
      if (savedBreak) {
        const parsedBreak = JSON.parse(savedBreak);
        if (parsedBreak.userId === parsedUser.id && !parsedBreak.endTime) {
          setCurrentBreak(parsedBreak);
          setIsOnBreak(true);
          localStorage.setItem('isOnBreak', 'true');
        }
      }

      // Fetch active shift from backend on login
      try {
        const active = await api.get<any>('/shifts/active');
        if (active) {
          setActiveShift(active);
          localStorage.setItem('activeShift', JSON.stringify(active));
        } else {
          setActiveShift(null);
          localStorage.removeItem('activeShift');
        }
      } catch (err) {
        console.error('Failed to restore active shift on login:', err);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const logout = async () => {
    if (isOnBreak && currentSession) {
      try {
        await api.post('/users/breaks/end', {});
      } catch (e) {
        console.error('Failed to end break on server:', e);
      }
    }

    if (currentSession) {
      try {
        await api.post('/auth/logout', { sessionId: currentSession.id });
      } catch (e) {
        console.error('Failed to log out session on server:', e);
      }
    }

    clearToken();
    setUser(null);
    setCurrentSession(null);
    setCurrentBreak(null);
    setIsOnBreak(false);
    setActiveShift(null);

    // Developer exception: reset onboarding flags on logout to ensure fresh state for next session
    if (user?.username === 'developer') {
      localStorage.removeItem('nexusflowOnboarded');
      localStorage.removeItem('nexusflowSector');
      localStorage.removeItem('nexusflowMultiSectorEnabled');
      localStorage.removeItem('evalixOnboarded');
      localStorage.removeItem('evalixSector');
      localStorage.removeItem('evalixMultiSectorEnabled');
    }

    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentSession');
    localStorage.removeItem('currentBreak');
    localStorage.removeItem('isOnBreak');
    localStorage.removeItem('activeShift');
  };

  // Shift start & end triggers
  const startShift = async (initialCash: number) => {
    try {
      const active = await api.post<any>('/shifts/start', { initialCash });
      setActiveShift(active);
      localStorage.setItem('activeShift', JSON.stringify(active));
    } catch (err: any) {
      console.error('Failed to start shift:', err);
      throw err;
    }
  };

  const endShift = async (actualCash: number, actualUpi: number, actualCard: number, notes?: string): Promise<ShiftRecord> => {
    try {
      const closed = await api.post<any>('/shifts/end', { actualCash, actualUpi, actualCard, notes });
      setActiveShift(null);
      localStorage.removeItem('activeShift');
      return closed;
    } catch (err: any) {
      console.error('Failed to end shift:', err);
      throw err;
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    if (user.role === 'owner' || user.role === 'co-owner') return true;
    return user.permissions.includes(permission);
  };

  const isOwner = (): boolean => {
    return user?.role === 'owner' || user?.role === 'co-owner';
  };

  const startBreak = async () => {
    if (!user || isOnBreak) return;

    try {
      const breakId = Math.random().toString(36).substring(2, 15);
      const res = await api.post<{ id: string; start_time: string }>('/users/breaks/start', { breakId });

      const breakRecord: BreakRecord = {
        id: res.id,
        userId: user.id,
        startTime: res.start_time,
      };

      setCurrentBreak(breakRecord);
      setIsOnBreak(true);

      localStorage.setItem('currentBreak', JSON.stringify(breakRecord));
      localStorage.setItem('isOnBreak', 'true');

      setUser(null);
      localStorage.removeItem('currentUser');
    } catch (error) {
      console.error('Failed to start break:', error);
      throw error;
    }
  };

  const endBreak = async () => {
    if (!user || !isOnBreak || !currentBreak) return;

    try {
      await api.post('/users/breaks/end', {});

      setCurrentBreak(null);
      setIsOnBreak(false);

      localStorage.removeItem('currentBreak');
      localStorage.removeItem('isOnBreak');
    } catch (error) {
      console.error('Failed to end break:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        activeShift,
        startShift,
        endShift,
        hasPermission,
        isOwner,
        currentSession,
        startBreak,
        endBreak,
        isOnBreak,
        currentBreak,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}