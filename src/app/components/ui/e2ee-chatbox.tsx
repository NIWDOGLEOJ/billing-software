import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  ShieldCheck,
  ShieldAlert,
  Key,
  X,
  Lock,
  Users,
  Receipt,
  CheckCircle2,
  Clock,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useWebSocket } from '../../hooks/useWebSocket';
import { api } from '../../utils/api';
import { toast } from 'sonner';
import {
  MONO,
  NUM,
  EYEBROW,
  PANEL,
  PANEL_HEAD,
  FIELD,
  KBD,
  KBD_ON_FILL,
  inr,
} from '../../lib/design-system';

interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: string;
  ciphertext: string;
  iv: string;
  timestamp: string;
  fingerprint: string;
  isBillTransfer?: boolean;
  recipientName?: string;
}

export function E2EEChatbox() {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('store-secure-terminal');
  const [showSettings, setShowSettings] = useState(false);
  const [hideClaimedBills, setHideClaimedBills] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hideClaimedBills') === 'true';
    } catch {
      return false;
    }
  });
  const [claimedOrders, setClaimedOrders] = useState<Record<string, { claimedBy: string; claimedAt: string }>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [keyFingerprint, setKeyFingerprint] = useState('');
  const [activeUsersCount, setActiveUsersCount] = useState(1);
  const [recipientName, setRecipientName] = useState<string>('All');
  const [activeUsers, setActiveUsers] = useState<Array<{ name: string; role: string; id: string | number }>>([]);

  // Developer Archive Explorer states
  const [devViewMode, setDevViewMode] = useState<'chat' | 'explorer'>('chat');
  const [archiveDate, setArchiveDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [archiveSender, setArchiveSender] = useState<string>('All');
  const [archiveMessages, setArchiveMessages] = useState<ChatMessage[]>([]);
  const [distinctSenders, setDistinctSenders] = useState<string[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const derivedKeysCache = useRef<Record<string, { key: CryptoKey; fp: string }>>({});

  // 🔒 Derives a 256-bit AES-GCM key and fingerprint from a passphrase using Web Crypto SubtleCrypto
  const deriveKeyAndFingerprint = useCallback(async (phrase: string) => {
    if (derivedKeysCache.current[phrase]) {
      const cached = derivedKeysCache.current[phrase];
      setCryptoKey(cached.key);
      setKeyFingerprint(cached.fp);
      return;
    }

    try {
      const encoder = new TextEncoder();
      const phraseBytes = encoder.encode(phrase);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', phraseBytes);
      const key = await window.crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );

      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fp = hashArray
        .slice(0, 4)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join('-');

      derivedKeysCache.current[phrase] = { key, fp };
      setCryptoKey(key);
      setKeyFingerprint(fp);
    } catch (e) {
      console.error('[E2EE] Failed to derive cryptographic key:', e);
    }
  }, []);

  useEffect(() => {
    deriveKeyAndFingerprint(passphrase);
  }, [passphrase, deriveKeyAndFingerprint]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setUnreadCount(0);
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener('toggle-e2ee-chat', handleToggle);
    return () => window.removeEventListener('toggle-e2ee-chat', handleToggle);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chat-unread-updated', { detail: { count: unreadCount } }));
  }, [unreadCount]);

  useEffect(() => {
    if (isOpen) {
      const loadChatHistory = async () => {
        try {
          const history = await api.get<ChatMessage[]>('/chats');
          setMessages((prev) => {
            const merged = [...prev];
            for (const h of history) {
              if (!merged.some((m) => m.id === h.id)) {
                merged.push(h);
              }
            }
            return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          });
        } catch (e) {
          console.error('[E2EE] Failed to load chat history:', e);
        }
      };
      loadChatHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && user?.username === 'developer' && devViewMode === 'explorer') {
      const fetchSenders = async () => {
        try {
          const senders = await api.get<string[]>('/chats/senders');
          setDistinctSenders(senders);
        } catch (e) {
          console.error('[E2EE] Failed to fetch distinct senders:', e);
        }
      };
      fetchSenders();
    }
  }, [isOpen, devViewMode, user]);

  const handleQueryArchive = async () => {
    setIsLoadingArchive(true);
    try {
      const params: Record<string, string> = {};
      if (archiveDate) params.date = archiveDate;
      if (archiveSender && archiveSender !== 'All') params.sender = archiveSender;

      const queryStr = new URLSearchParams(params).toString();
      const results = await api.get<ChatMessage[]>(`/chats/developer?${queryStr}`);
      setArchiveMessages(results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
    } catch (e) {
      console.error('[E2EE] Failed to query archive:', e);
      toast.error('Failed to fetch developer archives');
    } finally {
      setIsLoadingArchive(false);
    }
  };

  const { send } = useWebSocket({
    CHAT_MESSAGE: (data: any) => {
      if (data && typeof data === 'object') {
        const msg = data as ChatMessage;
        const isForMe =
          !msg.recipientName ||
          msg.recipientName === 'All' ||
          msg.recipientName === user?.name ||
          msg.senderName === user?.name ||
          user?.username === 'developer';

        if (!isForMe) return;

        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        if (!isOpen) {
          setUnreadCount((c) => c + 1);
        }
      }
    },
    EDIT_CHAT_MESSAGE: (data: any) => {
      if (data && typeof data === 'object') {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.id ? { ...m, ciphertext: data.ciphertext, iv: data.iv } : m))
        );
      }
    },
    DELETE_CHAT_MESSAGE: (data: any) => {
      if (data && data.id) {
        setMessages((prev) => prev.filter((m) => m.id !== data.id));
      }
    },
    RESERVATION_CLAIMED: (data: any) => {
      if (data && (data.reservationId || data.chatId)) {
        const claimant = data.claimedBy || 'Cashier';
        const claimTime = data.claimedAt || new Date().toISOString();
        setClaimedOrders((prev) => ({
          ...prev,
          ...(data.reservationId ? { [data.reservationId]: { claimedBy: claimant, claimedAt: claimTime } } : {}),
          ...(data.chatId ? { [data.chatId]: { claimedBy: claimant, claimedAt: claimTime } } : {}),
        }));

        setMessages((prev) =>
          prev.map((m) => {
            if (data.chatId && m.id === data.chatId) {
              try {
                const parsed = JSON.parse(m.ciphertext);
                parsed.isAccepted = true;
                parsed.claimedBy = claimant;
                parsed.claimedAt = claimTime;
                parsed.status = 'claimed';
                return { ...m, ciphertext: JSON.stringify(parsed) };
              } catch {}
            }
            try {
              const parsed = JSON.parse(m.ciphertext);
              if (parsed && (parsed.reservationId === data.reservationId || parsed.id === data.reservationId)) {
                parsed.isAccepted = true;
                parsed.claimedBy = claimant;
                parsed.claimedAt = claimTime;
                parsed.status = 'claimed';
                return { ...m, ciphertext: JSON.stringify(parsed) };
              }
            } catch {}
            return m;
          })
        );
      }
    },
    ACTIVE_USERS_LIST: (data: any) => {
      if (Array.isArray(data)) {
        setActiveUsers(data);
        setActiveUsersCount(data.length);
      }
    },
    STOCK_UPDATED: () => {
      setActiveUsersCount((c) => Math.max(c, 2));
    },
  });

  useEffect(() => {
    if (user) {
      const register = () => {
        send('REGISTER_USER', {
          name: user.name,
          username: user.username,
          role:
            user.username === 'developer'
              ? 'Employee'
              : user.role === 'owner'
              ? 'Owner'
              : user.role === 'co-owner'
              ? 'Co-Owner'
              : 'Employee',
          id: user.id,
        });
      };

      register();
      const interval = setInterval(register, 10000);
      return () => clearInterval(interval);
    }
  }, [user, send]);

  const handleClaimBill = useCallback((reservationId?: string, chatId?: string, cashierName?: string) => {
    const claimant = cashierName || user?.name || 'Cashier';
    const claimTime = new Date().toISOString();
    setClaimedOrders((prev) => ({
      ...prev,
      ...(reservationId ? { [reservationId]: { claimedBy: claimant, claimedAt: claimTime } } : {}),
      ...(chatId ? { [chatId]: { claimedBy: claimant, claimedAt: claimTime } } : {}),
    }));
    send('RESERVATION_CLAIMED', {
      reservationId: reservationId || chatId,
      chatId: chatId,
      claimedBy: claimant,
      claimedAt: claimTime,
    });
  }, [user, send]);

  const handleShareCart = useCallback(async () => {
    if (!cryptoKey) return;

    const onCartReceived = async (e: Event) => {
      window.removeEventListener('share-cart-data-response', onCartReceived);
      const data = (e as CustomEvent).detail;
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        toast.error('Cannot share an empty cart');
        return;
      }

      try {
        const payload = {
          type: 'BILL_TRANSFER',
          items: data.items,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          paymentMode: data.paymentMode,
          amountReceived: data.amountReceived,
          total: data.items.reduce((sum: number, item: any) => {
            const lineTotal = item.price * item.quantity;
            const lineGst = (lineTotal * item.gstRate) / 100;
            return sum + lineTotal + lineGst;
          }, 0),
        };

        const encoder = new TextEncoder();
        const plaintextBytes = encoder.encode(JSON.stringify(payload));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedBuffer = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          plaintextBytes
        );

        const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
        const ivBase64 = btoa(String.fromCharCode(...iv));

        const chatMsg: ChatMessage = {
          id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          senderName: user?.username === 'developer' ? 'System Support' : user?.name || 'Cashier',
          senderRole:
            user?.username === 'developer'
              ? 'System'
              : user?.role === 'owner'
              ? 'Owner'
              : user?.role === 'co-owner'
              ? 'Co-Owner'
              : 'Employee',
          ciphertext: ciphertextBase64,
          iv: ivBase64,
          timestamp: new Date().toISOString(),
          fingerprint: keyFingerprint,
          isBillTransfer: true,
          recipientName: recipientName,
        };

        setMessages((prev) => [...prev, chatMsg]);
        send('CHAT_MESSAGE', chatMsg);
        toast.success('Active cart shared to LAN chat');
      } catch (err) {
        console.error('[E2EE] Failed to encrypt cart transfer payload:', err);
      }
    };

    window.addEventListener('share-cart-data-response', onCartReceived);
    window.dispatchEvent(new Event('trigger-cart-share-request'));
    setTimeout(() => {
      window.removeEventListener('share-cart-data-response', onCartReceived);
    }, 500);
  }, [cryptoKey, user, keyFingerprint, send, recipientName]);

  const handleDeleteMessage = useCallback(
    async (msgId: string) => {
      try {
        await api.delete(`/chats/${msgId}`);
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        send('DELETE_CHAT_MESSAGE', { id: msgId });
        toast.success('Message deleted');
      } catch (e: any) {
        console.error('[E2EE] Failed to delete message:', e);
        toast.error('Failed to delete message');
      }
    },
    [send]
  );

  const handleEditMessage = useCallback(
    async (msgId: string, newText: string) => {
      if (!cryptoKey) return;
      try {
        const encoder = new TextEncoder();
        const plaintextBytes = encoder.encode(newText);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedBuffer = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          plaintextBytes
        );

        const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
        const ivBase64 = btoa(String.fromCharCode(...iv));

        await api.put(`/chats/${msgId}`, {
          ciphertext: ciphertextBase64,
          iv: ivBase64,
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, ciphertext: ciphertextBase64, iv: ivBase64 } : m))
        );

        send('EDIT_CHAT_MESSAGE', {
          id: msgId,
          ciphertext: ciphertextBase64,
          iv: ivBase64,
        });
        toast.success('Message updated');
      } catch (e) {
        console.error('[E2EE] Failed to update message:', e);
        toast.error('Failed to update message');
      }
    },
    [cryptoKey, send]
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !cryptoKey) return;

    try {
      const text = inputText.trim();
      setInputText('');

      const encoder = new TextEncoder();
      const plaintextBytes = encoder.encode(text);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        plaintextBytes
      );

      const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
      const ivBase64 = btoa(String.fromCharCode(...iv));

      const chatMsg: ChatMessage = {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderName: user?.username === 'developer' ? 'System Support' : user?.name || 'Cashier',
        senderRole:
          user?.username === 'developer'
            ? 'System'
            : user?.role === 'owner'
            ? 'Owner'
            : user?.role === 'co-owner'
            ? 'Co-Owner'
            : 'Employee',
        ciphertext: ciphertextBase64,
        iv: ivBase64,
        timestamp: new Date().toISOString(),
        fingerprint: keyFingerprint,
        recipientName: recipientName,
      };

      setMessages((prev) => [...prev, chatMsg]);
      send('CHAT_MESSAGE', chatMsg);
    } catch (e) {
      console.error('[E2EE] Failed to encrypt message:', e);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          role="dialog"
          aria-label="Encrypted LAN Register Chat"
          style={{
            ...PANEL,
            position: 'fixed',
            bottom: 24,
            right: 20,
            zIndex: 50,
            width: 390,
            maxWidth: 'calc(100vw - 32px)',
            height: 540,
            maxHeight: 'calc(100vh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.28)',
          }}
          className="animate-fadeIn"
        >
          {/* Header Strip per instrument panel spec */}
          <div
            style={{
              ...PANEL_HEAD,
              padding: '12px 14px',
              justifyContent: 'space-between',
              background: 'var(--panel)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--ok)',
                  boxShadow: '0 0 8px var(--ok)',
                  flexShrink: 0,
                }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span style={EYEBROW}>Encrypted LAN Chat</span>
                  <span style={KBD}>{keyFingerprint || '...'}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }} className="truncate">
                  AES-256-GCM · {activeUsersCount} online
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setHideClaimedBills((prev) => {
                    const next = !prev;
                    try {
                      localStorage.setItem('hideClaimedBills', String(next));
                    } catch {}
                    toast.info(next ? 'Claimed bills hidden from view' : 'Claimed bills visible');
                    return next;
                  });
                }}
                title={hideClaimedBills ? 'Claimed bills are hidden (Click to show)' : 'Claimed bills are shown (Click to auto-hide)'}
                className="cursor-pointer transition-colors"
                style={{
                  ...FIELD,
                  height: 30,
                  padding: '0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: MONO,
                  background: hideClaimedBills ? 'var(--accent-soft)' : 'var(--sub)',
                  borderColor: hideClaimedBills ? 'var(--accent-line)' : 'var(--border2)',
                  color: hideClaimedBills ? 'var(--accent)' : 'var(--ink2)',
                }}
              >
                {hideClaimedBills ? <EyeOff size={12} /> : <CheckCircle2 size={12} />}
                <span>{hideClaimedBills ? 'Hidden' : 'Claimed'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                title="Encryption Key Settings"
                className="cursor-pointer transition-colors"
                style={{
                  ...FIELD,
                  width: 30,
                  height: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: showSettings ? 'var(--accent-soft)' : 'var(--sub)',
                  borderColor: showSettings ? 'var(--accent-line)' : 'var(--border2)',
                  color: showSettings ? 'var(--accent)' : 'var(--ink2)',
                }}
              >
                <Key size={13} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close chat (Esc)"
                className="cursor-pointer transition-colors"
                style={{
                  ...FIELD,
                  height: 30,
                  padding: '0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: MONO,
                  color: 'var(--ink2)',
                }}
              >
                <span>Close</span>
                <span style={KBD}>Esc</span>
              </button>
            </div>
          </div>

          {/* Developer Navigation Tabs */}
          {user?.username === 'developer' && (
            <div
              className="flex border-b text-[10px] uppercase font-bold tracking-wider shrink-0"
              style={{ borderColor: 'var(--rule)', background: 'var(--sub)' }}
            >
              <button
                type="button"
                onClick={() => setDevViewMode('chat')}
                className="flex-1 py-2 text-center cursor-pointer transition-colors"
                style={{
                  fontFamily: MONO,
                  borderBottom: devViewMode === 'chat' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: devViewMode === 'chat' ? 'var(--accent)' : 'var(--ink3)',
                  background: devViewMode === 'chat' ? 'var(--panel)' : 'transparent',
                }}
              >
                Live Chat
              </button>
              <button
                type="button"
                onClick={() => setDevViewMode('explorer')}
                className="flex-1 py-2 text-center cursor-pointer transition-colors"
                style={{
                  fontFamily: MONO,
                  borderBottom: devViewMode === 'explorer' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: devViewMode === 'explorer' ? 'var(--accent)' : 'var(--ink3)',
                  background: devViewMode === 'explorer' ? 'var(--panel)' : 'transparent',
                }}
              >
                Archive Explorer
              </button>
            </div>
          )}

          {/* Encryption Key Settings Panel */}
          {showSettings && (
            <div
              className="p-3 border-b space-y-2 shrink-0 animate-slideDown"
              style={{ background: 'var(--sub)', borderColor: 'var(--rule)' }}
            >
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ fontFamily: MONO, color: 'var(--ink3)' }}>
                  Store Passphrase
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter store encryption key..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono"
                  style={{ ...FIELD, height: 34 }}
                />
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink3)' }}>
                All registers must use identical passphrases to decrypt broadcasts. Packets are encrypted locally before network transit.
              </p>
            </div>
          )}

          {devViewMode === 'explorer' && user?.username === 'developer' ? (
            <>
              <div
                className="p-3 border-b space-y-2 shrink-0"
                style={{ background: 'var(--sub)', borderColor: 'var(--rule)' }}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ fontFamily: MONO, color: 'var(--ink3)' }}>
                      Date
                    </label>
                    <input
                      type="date"
                      value={archiveDate}
                      onChange={(e) => setArchiveDate(e.target.value)}
                      className="w-full px-2 py-1 text-xs"
                      style={{ ...FIELD, height: 32 }}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ fontFamily: MONO, color: 'var(--ink3)' }}>
                      Sender
                    </label>
                    <select
                      value={archiveSender}
                      onChange={(e) => setArchiveSender(e.target.value)}
                      className="w-full px-2 py-1 text-xs"
                      style={{ ...FIELD, height: 32 }}
                    >
                      <option value="All">All Senders</option>
                      {distinctSenders.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleQueryArchive}
                  disabled={isLoadingArchive}
                  className="w-full h-8 text-xs font-bold rounded cursor-pointer transition-opacity flex items-center justify-center gap-1"
                  style={{ background: 'var(--ink)', color: 'var(--panel)', border: 0 }}
                >
                  {isLoadingArchive ? 'Retrieving Secure Logs...' : 'Query Archives'}
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3" style={{ background: 'var(--bg)' }}>
                {isLoadingArchive ? (
                  <div className="h-full flex items-center justify-center text-xs opacity-60" style={{ fontFamily: MONO }}>
                    Querying secure database...
                  </div>
                ) : archiveMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs font-bold" style={{ color: 'var(--ink2)' }}>No Archived Logs Found</p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--ink3)' }}>Select another date or cashier filter.</p>
                  </div>
                ) : (
                  archiveMessages.map((msg) => {
                    const isMe =
                      user?.username === 'developer'
                        ? msg.senderName === 'System Support'
                        : msg.senderName === (user?.name || 'Cashier');
                    return (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        isMe={isMe}
                        cryptoKey={cryptoKey}
                        hideClaimed={hideClaimedBills}
                        claimedOrders={claimedOrders}
                        onClaim={handleClaimBill}
                        onEdit={handleEditMessage}
                        onDelete={handleDeleteMessage}
                      />
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          ) : (
            <>
              {/* Channel / Recipient Selector Chips */}
              <div
                className="px-3 py-2 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
                style={{ background: 'var(--sub)', borderColor: 'var(--rule)' }}
              >
                <button
                  type="button"
                  onClick={() => setRecipientName('All')}
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
                  style={{
                    fontFamily: MONO,
                    background: recipientName === 'All' ? 'var(--ink)' : 'var(--panel)',
                    color: recipientName === 'All' ? 'var(--panel)' : 'var(--ink2)',
                    border: '1px solid var(--border2)',
                  }}
                >
                  <span>Broadcast</span>
                  <span
                    className="px-1 py-0.2 rounded text-[9px]"
                    style={{
                      background: recipientName === 'All' ? 'var(--panel)' : 'var(--rule)',
                      color: recipientName === 'All' ? 'var(--ink)' : 'var(--ink3)',
                    }}
                  >
                    {messages.filter((m) => {
                      const ageMs = Date.now() - new Date(m.timestamp).getTime();
                      return ageMs < 24 * 60 * 60 * 1000 && (!m.recipientName || m.recipientName === 'All');
                    }).length}
                  </span>
                </button>

                {(() => {
                  const conversationNames = new Set<string>();
                  activeUsers.filter((u) => u.name !== user?.name).forEach((u) => conversationNames.add(u.name));
                  messages.forEach((m) => {
                    const ageMs = Date.now() - new Date(m.timestamp).getTime();
                    if (ageMs < 24 * 60 * 60 * 1000 && m.recipientName && m.recipientName !== 'All') {
                      if (m.senderName !== user?.name) conversationNames.add(m.senderName);
                      if (m.recipientName !== user?.name) conversationNames.add(m.recipientName);
                    }
                  });

                  return Array.from(conversationNames).map((name) => {
                    const onlineUser = activeUsers.find((u) => u.name === name);
                    const isOnline = !!onlineUser;
                    const count = messages.filter((m) => {
                      const ageMs = Date.now() - new Date(m.timestamp).getTime();
                      if (ageMs >= 24 * 60 * 60 * 1000) return false;
                      if (user?.username === 'developer') return m.senderName === name || m.recipientName === name;
                      return (
                        (m.senderName === name && m.recipientName === user?.name) ||
                        (m.senderName === user?.name && m.recipientName === name)
                      );
                    }).length;

                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setRecipientName(name)}
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                        style={{
                          fontFamily: MONO,
                          background: recipientName === name ? 'var(--ink)' : 'var(--panel)',
                          color: recipientName === name ? 'var(--panel)' : 'var(--ink2)',
                          border: '1px solid var(--border2)',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: isOnline ? 'var(--ok)' : 'var(--ink4)' }}
                        />
                        <span>{name}</span>
                        {count > 0 && (
                          <span
                            className="px-1 py-0.2 rounded text-[9px]"
                            style={{
                              background: recipientName === name ? 'var(--panel)' : 'var(--rule)',
                              color: recipientName === name ? 'var(--ink)' : 'var(--ink3)',
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3" style={{ background: 'var(--bg)' }}>
                {(() => {
                  const recentMessages = messages.filter((msg) => {
                    const ageMs = Date.now() - new Date(msg.timestamp).getTime();
                    if (ageMs >= 24 * 60 * 60 * 1000) return false;

                    if (recipientName === 'All') {
                      return !msg.recipientName || msg.recipientName === 'All';
                    } else {
                      if (user?.username === 'developer') {
                        return msg.senderName === recipientName || msg.recipientName === recipientName;
                      }
                      const isSenderRecipient = msg.senderName === recipientName && msg.recipientName === user?.name;
                      const isMeSending = msg.senderName === user?.name && msg.recipientName === recipientName;
                      return isSenderRecipient || isMeSending;
                    }
                  });

                  if (recentMessages.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4">
                        <p className="text-xs font-bold" style={{ color: 'var(--ink2)' }}>
                          {recipientName === 'All' ? 'Secure Outlet Broadcast' : `Private Chat with ${recipientName}`}
                        </p>
                        <p className="text-[11px] max-w-[200px] mt-1" style={{ color: 'var(--ink3)' }}>
                          All messages are end-to-end encrypted locally over LAN.
                        </p>
                      </div>
                    );
                  }

                  return recentMessages.map((msg) => {
                    const isMe =
                      user?.username === 'developer'
                        ? msg.senderName === 'System Support'
                        : msg.senderName === (user?.name || 'Cashier');
                    return (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        isMe={isMe}
                        cryptoKey={cryptoKey}
                        hideClaimed={hideClaimedBills}
                        claimedOrders={claimedOrders}
                        onClaim={handleClaimBill}
                        onEdit={handleEditMessage}
                        onDelete={handleDeleteMessage}
                      />
                    );
                  });
                })()}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <form
                onSubmit={handleSendMessage}
                className="p-2.5 border-t flex gap-2 shrink-0"
                style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}
              >
                <button
                  type="button"
                  onClick={handleShareCart}
                  title="Share active cart bill to LAN chat"
                  className="cursor-pointer transition-colors"
                  style={{
                    ...FIELD,
                    width: 38,
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ink2)',
                  }}
                >
                  <Receipt size={15} />
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={recipientName === 'All' ? 'Broadcast message to registers...' : `Message ${recipientName}...`}
                  className="flex-1 px-3 text-xs"
                  style={{ ...FIELD, height: 38 }}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="cursor-pointer transition-opacity disabled:opacity-40"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 7,
                    background: 'var(--ink)',
                    color: 'var(--panel)',
                    border: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Send size={14} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

// 📦 Decrypting Message Bubble with Instrument-Panel Design System
function MessageBubble({
  msg,
  isMe,
  cryptoKey,
  hideClaimed = false,
  claimedOrders = {},
  onClaim,
  onEdit,
  onDelete,
}: {
  msg: ChatMessage;
  isMe: boolean;
  cryptoKey: CryptoKey | null;
  hideClaimed?: boolean;
  claimedOrders?: Record<string, { claimedBy: string; claimedAt: string }>;
  onClaim?: (reservationId?: string, chatId?: string, cashierName?: string) => void;
  onEdit?: (id: string, newText: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [decryptionError, setDecryptionError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isEnteringOtp, setIsEnteringOtp] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [isClaimedLocally, setIsClaimedLocally] = useState(false);
  const [claimedByInfo, setClaimedByInfo] = useState<string | null>(null);
  const [claimedAtInfo, setClaimedAtInfo] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const handleStartEdit = () => {
    if (decryptedText !== null) {
      setEditText(decryptedText);
      setIsEditing(true);
    }
  };

  useEffect(() => {
    const decrypt = async () => {
      if (msg.iv === 'online_system' || msg.fingerprint === 'ONLINE_WEB') {
        setDecryptedText(msg.ciphertext);
        setDecryptionError(false);
        return;
      }

      if (!cryptoKey) return;

      try {
        const ciphertext = new Uint8Array(
          atob(msg.ciphertext)
            .split('')
            .map((c) => c.charCodeAt(0))
        );
        const iv = new Uint8Array(
          atob(msg.iv)
            .split('')
            .map((c) => c.charCodeAt(0))
        );

        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          ciphertext
        );

        const decoder = new TextDecoder();
        setDecryptedText(decoder.decode(decryptedBuffer));
        setDecryptionError(false);
      } catch (e) {
        try {
          const testParsed = JSON.parse(msg.ciphertext);
          if (testParsed && (testParsed.type === 'ONLINE_RESERVATION' || testParsed.isBillTransfer)) {
            setDecryptedText(msg.ciphertext);
            setDecryptionError(false);
            return;
          }
        } catch {}
        setDecryptedText(null);
        setDecryptionError(true);
      }
    };

    decrypt();
  }, [msg, cryptoKey]);

  const dateObj = new Date(msg.timestamp);
  const isToday = new Date().toDateString() === dateObj.toDateString();
  const timeString = isToday
    ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : `${dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  let billData: any = null;
  if (decryptedText) {
    try {
      let cleanText = decryptedText.trim();
      if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
        try {
          cleanText = JSON.parse(cleanText);
        } catch {}
      }
      let parsed = JSON.parse(cleanText);
      let safety = 0;
      while (typeof parsed === 'string' && safety < 5) {
        parsed = JSON.parse(parsed);
        safety++;
      }
      if (parsed && typeof parsed === 'object') {
        if (parsed.type === 'BILL_TRANSFER' || parsed.type === 'ONLINE_RESERVATION' || parsed.isBillTransfer || Array.isArray(parsed.items)) {
          billData = parsed;
        }
      }
    } catch {}
  }

  // Check if claimed either from server message, LAN broadcast override, or local state
  const claimedOverride = (billData?.reservationId && claimedOrders[billData.reservationId]) || claimedOrders[msg.id];
  const isClaimed =
    isClaimedLocally ||
    !!claimedOverride ||
    billData?.isAccepted ||
    billData?.status === 'claimed' ||
    billData?.status === 'completed' ||
    !!billData?.claimedBy ||
    !!billData?.acceptedBy;

  const claimantName = claimedByInfo || claimedOverride?.claimedBy || billData?.claimedBy || billData?.acceptedBy;
  const claimantTime = claimedAtInfo || claimedOverride?.claimedAt || billData?.claimedAt || billData?.acceptedAt;

  // If user dismissed this completed bill, or hideClaimed is active, hide it completely!
  if (isDismissed || (hideClaimed && isClaimed)) {
    return null;
  }

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full animate-fadeIn`}>
      {/* Sender Header */}
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: 'var(--ink2)' }}>
          {msg.senderName}
        </span>
        <span
          className="px-1 rounded text-[8px] font-bold uppercase tracking-wider"
          style={{
            fontFamily: MONO,
            background:
              msg.senderRole === 'Owner'
                ? 'var(--danger-soft)'
                : msg.senderRole === 'Co-Owner'
                ? 'var(--accent-soft)'
                : 'var(--rule)',
            color:
              msg.senderRole === 'Owner'
                ? 'var(--danger)'
                : msg.senderRole === 'Co-Owner'
                ? 'var(--accent)'
                : 'var(--ink3)',
          }}
        >
          {msg.senderRole}
        </span>

        {msg.recipientName && msg.recipientName !== 'All' && (
          <span
            className="text-[8px] font-semibold px-1 rounded"
            style={{ fontFamily: MONO, background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            Direct: {msg.recipientName}
          </span>
        )}

        {user?.username === 'developer' && decryptedText !== null && (
          <span className="flex items-center gap-1 ml-1.5 pl-1.5 border-l border-[var(--border2)]">
            {!billData && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="hover:underline cursor-pointer text-[9px]"
                style={{ color: 'var(--ink3)' }}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Delete this message?') && onDelete) {
                  onDelete(msg.id);
                }
              }}
              className="hover:underline cursor-pointer text-[9px]"
              style={{ color: 'var(--danger)' }}
            >
              Delete
            </button>
          </span>
        )}
      </div>

      {/* Message Body Container */}
      <div
        style={{
          maxWidth: '88%',
          borderRadius: 8,
          padding: billData ? 0 : '8px 12px',
          overflow: 'hidden',
          background: billData
            ? 'var(--panel)'
            : isMe
            ? 'var(--ink)'
            : 'var(--sub)',
          color: billData
            ? 'var(--ink)'
            : isMe
            ? 'var(--panel)'
            : 'var(--ink)',
          border: billData
            ? '1px solid var(--border)'
            : isMe
            ? '1px solid var(--ink)'
            : '1px solid var(--border2)',
        }}
      >
        {isEditing ? (
          <div className="flex flex-col gap-1.5 min-w-[160px] p-2">
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full px-2 py-1 text-xs"
              style={{ ...FIELD, height: 32 }}
              autoFocus
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (editText.trim() && onEdit) {
                    onEdit(msg.id, editText.trim());
                  }
                  setIsEditing(false);
                }}
                className="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer"
                style={{ background: 'var(--ink)', color: 'var(--panel)', border: 0 }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer"
                style={{ ...FIELD }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : decryptedText !== null ? (
          billData ? (
            /* 🔄 Bill Transfer / Customer Reservation Card */
            <div className="flex flex-col" style={{ width: 280 }}>
              {/* Card Header */}
              <div
                className="flex items-center justify-between px-3 py-2 border-b"
                style={{ borderColor: 'var(--rule)', background: 'var(--sub)' }}
              >
                <div className="flex items-center gap-1.5">
                  <Receipt size={13} style={{ color: 'var(--accent)' }} />
                  <span style={EYEBROW}>
                    {billData.type === 'ONLINE_RESERVATION' || billData.requiresOtp
                      ? 'Online Pickup Order'
                      : 'Bill Transfer'}
                  </span>
                </div>
                {isClaimed && (
                  <button
                    type="button"
                    onClick={() => setIsDismissed(true)}
                    title="Dismiss / hide completed bill"
                    className="cursor-pointer hover:opacity-80 p-0.5 text-[10px] font-bold"
                    style={{ color: 'var(--ink3)' }}
                  >
                    <EyeOff size={12} />
                  </button>
                )}
              </div>

              {/* Card Details */}
              <div className="p-3 space-y-2 text-xs">
                <div className="flex justify-between items-baseline">
                  <span style={{ color: 'var(--ink3)' }}>Items:</span>
                  <span style={{ fontFamily: MONO, fontWeight: 600 }}>
                    {billData.items?.length || 0} units
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span style={{ color: 'var(--ink3)' }}>Total value:</span>
                  <span style={{ ...NUM, fontWeight: 700, color: 'var(--accent)' }}>
                    {inr(billData.total || 0)}
                  </span>
                </div>
                {(billData.customerName || billData.customerPhone) && (
                  <div className="flex justify-between items-baseline">
                    <span style={{ color: 'var(--ink3)' }}>Customer:</span>
                    <span className="font-semibold truncate max-w-[140px]" style={{ color: 'var(--ink)' }}>
                      {billData.customerName || billData.customerPhone}
                    </span>
                  </div>
                )}

                {/* Handover & OTP State */}
                {isClaimed ? (
                  <div
                    className="p-2.5 rounded-lg flex items-center justify-between mt-2"
                    style={{
                      background: 'var(--ok-soft)',
                      border: '1px solid var(--ok-line)',
                      color: 'var(--ok-hi)',
                    }}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1 text-[11px]">
                        <CheckCircle2 size={13} />
                        <span>Order Claimed</span>
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ fontFamily: MONO }}>
                        by {claimantName || 'Cashier'}
                        {claimantTime ? ` · ${new Date(claimantTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDismissed(true)}
                      className="px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-opacity"
                      style={{
                        background: 'var(--panel)',
                        border: '1px solid var(--ok-line)',
                        color: 'var(--ok-hi)',
                        fontFamily: MONO,
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : !isMe ? (
                  billData.requiresOtp || billData.type === 'ONLINE_RESERVATION' ? (
                    !isEnteringOtp ? (
                      <button
                        type="button"
                        onClick={() => setIsEnteringOtp(true)}
                        className="w-full h-8 mt-1 rounded text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                        style={{ background: 'var(--ink)', color: 'var(--panel)', border: 0 }}
                      >
                        <Lock size={12} />
                        <span>Take Bill (Verify OTP)</span>
                      </button>
                    ) : (
                      <div
                        className="p-2.5 rounded-lg space-y-2 mt-1"
                        style={{ background: 'var(--sub)', border: '1px solid var(--border2)' }}
                      >
                        <div className="text-[10px] font-bold" style={{ fontFamily: MONO, color: 'var(--ink2)' }}>
                          Enter Customer 4-Digit OTP:
                        </div>
                        <input
                          type="text"
                          maxLength={6}
                          value={enteredOtp}
                          onChange={(e) => {
                            setEnteredOtp(e.target.value);
                            setOtpError(null);
                          }}
                          placeholder="4-digit OTP"
                          className="w-full h-8 text-center text-sm font-bold"
                          style={{ ...FIELD, ...NUM, letterSpacing: '0.2em' }}
                          autoFocus
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const code = enteredOtp.trim();
                              if (!code) return;
                              if (code !== String(billData.otp || '').trim()) {
                                setOtpError('Invalid OTP');
                                toast.error('Invalid OTP');
                                return;
                              }
                              try {
                                if (billData.reservationId) {
                                  await fetch(`/api/reservations/${billData.reservationId}/verify-otp`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ otp: code, cashierName: user?.name || 'Cashier' }),
                                  });
                                }
                              } catch {}
                              window.dispatchEvent(new CustomEvent('load-shared-cart-trigger', { detail: billData }));
                              setIsClaimedLocally(true);
                              setClaimedByInfo(user?.name || 'Cashier');
                              setClaimedAtInfo(new Date().toISOString());
                              setIsEnteringOtp(false);
                              onClaim?.(billData.reservationId || msg.id, msg.id, user?.name || 'Cashier');
                              toast.success('OTP Verified. Cart loaded into register.');
                            }
                          }}
                        />
                        {otpError && (
                          <div className="text-[10px] font-semibold" style={{ color: 'var(--danger)' }}>
                            {otpError}
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              const code = enteredOtp.trim();
                              if (!code) {
                                setOtpError('Please enter OTP');
                                return;
                              }
                              if (code !== String(billData.otp || '').trim()) {
                                setOtpError('Invalid OTP');
                                toast.error('Invalid OTP');
                                return;
                              }
                              try {
                                if (billData.reservationId) {
                                  await fetch(`/api/reservations/${billData.reservationId}/verify-otp`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ otp: code, cashierName: user?.name || 'Cashier' }),
                                  });
                                }
                              } catch {}
                              window.dispatchEvent(new CustomEvent('load-shared-cart-trigger', { detail: billData }));
                              setIsClaimedLocally(true);
                              setClaimedByInfo(user?.name || 'Cashier');
                              setClaimedAtInfo(new Date().toISOString());
                              setIsEnteringOtp(false);
                              onClaim?.(billData.reservationId || msg.id, msg.id, user?.name || 'Cashier');
                              toast.success('OTP Verified. Cart loaded into register.');
                            }}
                            className="flex-1 h-7 rounded text-[11px] font-bold cursor-pointer transition-opacity"
                            style={{ background: 'var(--ink)', color: 'var(--panel)', border: 0 }}
                          >
                            Verify & Load
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEnteringOtp(false);
                              setOtpError(null);
                            }}
                            className="px-2.5 h-7 rounded text-[11px] font-bold cursor-pointer"
                            style={{ ...FIELD }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('load-shared-cart-trigger', { detail: billData }));
                        setIsClaimedLocally(true);
                        setClaimedByInfo(user?.name || 'Cashier');
                        setClaimedAtInfo(new Date().toISOString());
                        onClaim?.(billData.reservationId || msg.id, msg.id, user?.name || 'Cashier');
                        toast.success('Cart loaded into register.');
                      }}
                      className="w-full h-8 mt-1 rounded text-xs font-bold cursor-pointer transition-opacity hover:opacity-90"
                      style={{ background: 'var(--ink)', color: 'var(--panel)', border: 0 }}
                    >
                      Accept Bill
                    </button>
                  )
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs leading-relaxed break-words font-medium select-text">{decryptedText}</p>
          )
        ) : decryptionError ? (
          <div className="space-y-1">
            <div className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'var(--danger)' }}>
              <ShieldAlert size={11} />
              <span>Decryption key mismatch</span>
            </div>
            <div className="font-mono text-[9px] opacity-60 break-all">{msg.ciphertext.slice(0, 36)}...</div>
          </div>
        ) : (
          <p className="text-xs italic opacity-60" style={{ fontFamily: MONO }}>Decrypting...</p>
        )}
      </div>

      {/* Timestamp & E2EE Label */}
      <div className="flex items-center gap-1.5 mt-1 px-1">
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>{timeString}</span>
        {decryptedText !== null && (
          <span
            className="flex items-center gap-0.5 text-[8.5px] font-bold tracking-wider uppercase"
            style={{ fontFamily: MONO, color: 'var(--ok)' }}
            title={`E2EE key: ${msg.fingerprint}`}
          >
            <ShieldCheck size={9} />
            E2EE
          </span>
        )}
      </div>
    </div>
  );
}
