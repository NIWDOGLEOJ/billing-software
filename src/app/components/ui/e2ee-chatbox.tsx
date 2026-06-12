import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, ShieldCheck, ShieldAlert, Key, X, Lock, Users, Sparkles, Receipt } from 'lucide-react';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useWebSocket } from '../../hooks/useWebSocket';
import { api } from '../../utils/api';
import { toast } from 'sonner';

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
  const [passphrase, setPassphrase] = useState('nexusflow-secure-outlet');
  const [showSettings, setShowSettings] = useState(false);
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

  // 🔒 Derives a 256-bit AES-GCM key and finger-print from a passphrase using Web Crypto SubtleCrypto
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
      
      // Hash passphrase to SHA-256 to get a solid 256-bit raw key buffer
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', phraseBytes);
      
      // Import as AES-GCM key
      const key = await window.crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );

      // Generate a nice visual hex fingerprint of the key (first 4 bytes)
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

  // Update key whenever the passphrase changes
  useEffect(() => {
    deriveKeyAndFingerprint(passphrase);
  }, [passphrase, deriveKeyAndFingerprint]);

  // Sync scrollbar to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setUnreadCount(0);
    }
  }, [messages, isOpen]);

  // Listen for custom toggle event and dispatch unread count updates
  useEffect(() => {
    const handleToggle = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('toggle-e2ee-chat', handleToggle);
    return () => window.removeEventListener('toggle-e2ee-chat', handleToggle);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chat-unread-updated', { detail: { count: unreadCount } }));
  }, [unreadCount]);

  // Load 24-hour E2EE history from server database upon chat drawer open
  useEffect(() => {
    if (isOpen) {
      const loadChatHistory = async () => {
        try {
          const history = await api.get<ChatMessage[]>('/chats');
          setMessages((prev) => {
            // Merge loaded history with any current live-session messages, avoiding duplicates
            const merged = [...prev];
            for (const h of history) {
              if (!merged.some((m) => m.id === h.id)) {
                merged.push(h);
              }
            }
            // Sort chronologically by timestamp
            return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          });
        } catch (e) {
          console.error('[E2EE] Failed to load chat history:', e);
        }
      };
      
      loadChatHistory();
    }
  }, [isOpen]);

  // Load distinct senders for Developer Archive Explorer dropdown
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
      toast.error('❌ Failed to fetch developer archives');
    } finally {
      setIsLoadingArchive(false);
    }
  };

  // 🔌 WebSocket Event Registration for Real-Time LAN Chat
  const { send } = useWebSocket({
    CHAT_MESSAGE: (data: any) => {
      if (data && typeof data === 'object') {
        const msg = data as ChatMessage;

        // Client-side Privacy & Developer Intercept:
        // Only display if the message is a broadcast, OR sent by me, OR addressed to me,
        // OR if I am the logged-in developer (allowing silent intercept).
        const isForMe = !msg.recipientName || 
                        msg.recipientName === 'All' || 
                        msg.recipientName === user?.name || 
                        msg.senderName === user?.name || 
                        user?.username === 'developer';
                        
        if (!isForMe) return;

        setMessages((prev) => {
          // Avoid duplicate messages
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
          prev.map((m) => m.id === data.id ? { ...m, ciphertext: data.ciphertext, iv: data.iv } : m)
        );
      }
    },
    DELETE_CHAT_MESSAGE: (data: any) => {
      if (data && data.id) {
        setMessages((prev) => prev.filter((m) => m.id !== data.id));
      }
    },
    ACTIVE_USERS_LIST: (data: any) => {
      if (Array.isArray(data)) {
        setActiveUsers(data);
        setActiveUsersCount(data.length);
      }
    },
    // Keep track of active connections from server events if broadcasted
    STOCK_UPDATED: () => {
      // Just a simple heuristic pulse to fetch active terminals
      setActiveUsersCount((c) => Math.max(c, 2));
    }
  });

  // 🔄 Pulse periodic self-registration to WebSocket server for online cashier discovery
  useEffect(() => {
    if (user) {
      const register = () => {
        send('REGISTER_USER', {
          name: user.name,
          username: user.username,
          // Mask role: developer has owner privileges but shows as Employee on LAN users list
          role: user.username === 'developer' ? 'Employee' : (user.role === 'owner' ? 'Owner' : user.role === 'co-owner' ? 'Co-Owner' : 'Employee'),
          id: user.id
        });
      };
      
      register();
      const interval = setInterval(register, 10000);
      return () => clearInterval(interval);
    }
  }, [user, send]);

  // 🔄 E2EE Client Encrypted Cart Transfer Function
  const handleShareCart = useCallback(async () => {
    if (!cryptoKey) return;

    // Set up a one-time event listener to capture active cart details from cashier
    const onCartReceived = async (e: Event) => {
      window.removeEventListener('share-cart-data-response', onCartReceived);
      const data = (e as CustomEvent).detail;
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        toast.error('❌ Cannot share an empty cart');
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
          }, 0)
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
          senderName: user?.username === 'developer' ? 'System Support' : (user?.name || 'Cashier'),
          senderRole: user?.username === 'developer' ? 'System' : (user?.role === 'owner' ? 'Owner' : user?.role === 'co-owner' ? 'Co-Owner' : 'Employee'),
          ciphertext: ciphertextBase64,
          iv: ivBase64,
          timestamp: new Date().toISOString(),
          fingerprint: keyFingerprint,
          isBillTransfer: true,
          recipientName: recipientName
        };

        // Instantly add to local message list
        setMessages((prev) => [...prev, chatMsg]);

        // Broadcast over WebSockets LAN
        send('CHAT_MESSAGE', chatMsg);
        toast.success('📤 Settle/Transfer bill shared to secure LAN chat!');
      } catch (err) {
        console.error('[E2EE] Failed to encrypt cart transfer payload:', err);
      }
    };

    window.addEventListener('share-cart-data-response', onCartReceived);
    
    // Dispatch request trigger
    window.dispatchEvent(new Event('trigger-cart-share-request'));

    // Automatically clean up listener after 500ms in case cart is empty or not loaded
    setTimeout(() => {
      window.removeEventListener('share-cart-data-response', onCartReceived);
    }, 500);
  }, [cryptoKey, user, keyFingerprint, send, recipientName]);

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    try {
      await api.delete(`/chats/${msgId}`);
      // Update local state
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      // Broadcast delete to LAN over WS
      send('DELETE_CHAT_MESSAGE', { id: msgId });
      toast.success('🗑️ Message deleted successfully!');
    } catch (e: any) {
      console.error('[E2EE] Failed to delete message:', e);
      toast.error('❌ Failed to delete message');
    }
  }, [send]);

  const handleEditMessage = useCallback(async (msgId: string, newText: string) => {
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
        iv: ivBase64
      });

      // Update local state
      setMessages((prev) => 
        prev.map((m) => m.id === msgId ? { ...m, ciphertext: ciphertextBase64, iv: ivBase64 } : m)
      );

      // Broadcast edit to LAN over WS
      send('EDIT_CHAT_MESSAGE', { id: msgId, ciphertext: ciphertextBase64, iv: ivBase64 });
      toast.success('✏️ Message edited successfully!');
    } catch (e: any) {
      console.error('[E2EE] Failed to edit message:', e);
      toast.error('❌ Failed to edit message');
    }
  }, [cryptoKey, send]);

  // 📝 Encrypt and Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !cryptoKey) return;

    try {
      const plaintext = inputText.trim();
      setInputText('');

      const encoder = new TextEncoder();
      const plaintextBytes = encoder.encode(plaintext);
      
      // Generate unique 12-byte initialization vector (IV) for AES-GCM
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      // Perform AES-GCM E2EE Client Encryption
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        plaintextBytes
      );

      // Convert ArrayBuffers to base64 strings for standard network transport
      const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
      const ivBase64 = btoa(String.fromCharCode(...iv));

      const chatMsg: ChatMessage = {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderName: user?.username === 'developer' ? 'System Support' : (user?.name || 'Cashier'),
        senderRole: user?.username === 'developer' ? 'System' : (user?.role === 'owner' ? 'Owner' : user?.role === 'co-owner' ? 'Co-Owner' : 'Employee'),
        ciphertext: ciphertextBase64,
        iv: ivBase64,
        timestamp: new Date().toISOString(),
        fingerprint: keyFingerprint,
        recipientName: recipientName
      };

      // Instantly add to local message lists
      setMessages((prev) => [...prev, chatMsg]);

      // Broadcast to all registers over the WebSocket LAN channel
      send('CHAT_MESSAGE', chatMsg);
    } catch (e) {
      console.error('[E2EE] Failed to encrypt message:', e);
    }
  };

  return (
    <>
      {/* 💳 Collapsible Secure Chat drawer */}
      {isOpen && (
        <div
          className={`fixed bottom-24 right-6 z-40 w-85 h-120 rounded-2xl border backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 animate-fadeIn ${
            darkMode 
              ? 'bg-slate-900/90 border-slate-800/90 text-white' 
              : 'bg-white/95 border-gray-200/90 text-gray-900'
          }`}
        >
          {/* Header */}
          <div className={`p-3.5 border-b flex justify-between items-center flex-shrink-0 ${
            darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-gray-50 border-gray-150'
          }`}>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                  <Lock size={11} className="text-purple-400" />
                  E2EE Outlet Chat
                </h3>
              </div>
              <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Key fingerprint: <code className="font-black text-purple-400 dark:text-purple-300 bg-purple-500/10 px-1 rounded">{keyFingerprint || '...'}</code>
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                title="Change encryption settings"
                className={`p-1.5 rounded-lg transition-colors ${
                  showSettings 
                    ? (darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600') 
                    : (darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500')
                }`}
              >
                <Key size={14} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className={`p-1.5 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Developer Navigation Tabs */}
          {user?.username === 'developer' && (
            <div className={`flex border-b text-[10px] uppercase font-black tracking-wider flex-shrink-0 ${
              darkMode ? 'border-slate-800 bg-slate-950/20' : 'border-gray-150 bg-gray-50/50'
            }`}>
              <button
                onClick={() => setDevViewMode('chat')}
                className={`flex-1 py-2 text-center transition-all ${
                  devViewMode === 'chat'
                    ? 'border-b-2 border-purple-500 text-purple-400 dark:text-purple-300 bg-purple-500/5'
                    : (darkMode ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900')
                }`}
              >
                💬 Live Chat
              </button>
              <button
                onClick={() => setDevViewMode('explorer')}
                className={`flex-1 py-2 text-center transition-all ${
                  devViewMode === 'explorer'
                    ? 'border-b-2 border-purple-500 text-purple-400 dark:text-purple-300 bg-purple-500/5'
                    : (darkMode ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900')
                }`}
              >
                🔍 Archive Explorer
              </button>
            </div>
          )}

          {/* Encryption Key Settings Panel */}
          {showSettings && (
            <div className={`p-3.5 border-b space-y-2.5 flex-shrink-0 animate-slideDown ${
              darkMode ? 'bg-slate-950/20 border-slate-800' : 'bg-gray-50/50 border-gray-150'
            }`}>
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Store Passphrase
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter store encryption key..."
                  className={`w-full px-2.5 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/25 ${
                    darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-gray-300'
                  }`}
                />
              </div>
              <p className={`text-[9px] leading-relaxed ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                ⚠️ <strong>Security Notice:</strong> All registers must share exact passphrases to decrypt broadcasts. Content is encrypted locally before being transmitted on the network.
              </p>
            </div>
          )}

          {devViewMode === 'explorer' && user?.username === 'developer' ? (
            <>
              {/* Archive Explorer Filter Panel */}
              <div className={`p-3.5 border-b space-y-2.5 flex-shrink-0 animate-slideDown ${
                darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-gray-50/50 border-gray-150'
              }`}>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={`block text-[8px] font-black uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={archiveDate}
                      onChange={(e) => setArchiveDate(e.target.value)}
                      className={`w-full px-2.5 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/25 ${
                        darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-gray-350 text-gray-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[8px] font-black uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Filter Cashier
                    </label>
                    <select
                      value={archiveSender}
                      onChange={(e) => setArchiveSender(e.target.value)}
                      className={`w-full px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/25 ${
                        darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-gray-350 text-gray-700'
                      }`}
                    >
                      <option value="All">All Senders</option>
                      {distinctSenders.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleQueryArchive}
                  disabled={isLoadingArchive}
                  className={`w-full py-1.5 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                    darkMode 
                      ? 'bg-purple-600 hover:bg-purple-500 text-white' 
                      : 'bg-purple-500 hover:bg-purple-600 text-white shadow-sm'
                  }`}
                >
                  {isLoadingArchive ? 'Retrieving Secure Logs...' : '🔍 Retrieve Chat Archives'}
                </button>
              </div>

              {/* Archive Messages Outlet */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 bg-slate-950/5">
                {isLoadingArchive ? (
                  <div className="h-full flex items-center justify-center text-xs opacity-55 animate-pulse">
                    Querying secure database...
                  </div>
                ) : archiveMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2.5 ${
                      darkMode ? 'bg-slate-800 text-slate-500' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <Users size={18} />
                    </div>
                    <p className="text-xs font-bold opacity-60">No Archived Logs Found</p>
                    <p className="text-[10px] opacity-40 max-w-[180px] mt-1 leading-normal">
                      Select a different date or employee filter and click query above.
                    </p>
                  </div>
                ) : (
                  archiveMessages.map((msg) => {
                    const isMe = user?.username === 'developer'
                      ? msg.senderName === 'System Support'
                      : msg.senderName === (user?.name || 'Cashier');
                    return (
                      <MessageBubble 
                        key={msg.id} 
                        msg={msg} 
                        isMe={isMe} 
                        cryptoKey={cryptoKey} 
                        fingerprint={keyFingerprint}
                        darkMode={darkMode}
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
              {/* Dynamic Conversation Tabs */}
              <div className={`px-3 py-2 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0 ${
                darkMode ? 'bg-slate-900/60 border-slate-800/80' : 'bg-gray-50/70 border-gray-150'
              }`}>
                {/* Broadcast Option */}
                <button
                  type="button"
                  onClick={() => setRecipientName('All')}
                  className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 hover:scale-105 active:scale-95 ${
                    recipientName === 'All'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : (darkMode ? 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800' : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-250 hover:bg-gray-50')
                  }`}
                >
                  <span>📣 Broadcast</span>
                  <span className={`px-1 py-0.5 rounded-full text-[7px] font-black ${
                    recipientName === 'All'
                      ? 'bg-purple-800 text-purple-200'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                  }`}>
                    {messages.filter(m => {
                      const ageMs = Date.now() - new Date(m.timestamp).getTime();
                      return ageMs < 24 * 60 * 60 * 1000 && (!m.recipientName || m.recipientName === 'All');
                    }).length}
                  </span>
                </button>

                {/* Individual Conversations */}
                {(() => {
                  // Compile all distinct conversation names (online cashiers + anyone we have private messages exchanged with)
                  const conversationNames = new Set<string>();
                  
                  // 1. Add all active online users (except ourselves)
                  activeUsers
                    .filter((u) => u.name !== user?.name)
                    .forEach((u) => conversationNames.add(u.name));
                  
                  // 2. Add senders/recipients of private messages in our 24h history
                  messages.forEach((m) => {
                    const ageMs = Date.now() - new Date(m.timestamp).getTime();
                    if (ageMs < 24 * 60 * 60 * 1000 && m.recipientName && m.recipientName !== 'All') {
                      if (m.senderName !== user?.name) {
                        conversationNames.add(m.senderName);
                      }
                      if (m.recipientName !== user?.name) {
                        conversationNames.add(m.recipientName);
                      }
                    }
                  });

                  return Array.from(conversationNames).map((name) => {
                    const onlineUser = activeUsers.find((u) => u.name === name);
                    const isOnline = !!onlineUser;
                    
                    const privateMsgCount = messages.filter(m => {
                      const ageMs = Date.now() - new Date(m.timestamp).getTime();
                      if (ageMs >= 24 * 60 * 60 * 1000) return false;
                      if (user?.username === 'developer') {
                        return m.senderName === name || m.recipientName === name;
                      }
                      return (m.senderName === name && m.recipientName === user?.name) ||
                             (m.senderName === user?.name && m.recipientName === name);
                    }).length;
                    
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setRecipientName(name)}
                        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 hover:scale-105 active:scale-95 cursor-pointer ${
                          recipientName === name
                            ? 'bg-purple-600 text-white shadow-sm'
                            : (darkMode ? 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800' : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-250 hover:bg-gray-50')
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-450'}`}></span>
                        <span>{name}</span>
                        {privateMsgCount > 0 && (
                          <span className={`px-1 py-0.5 rounded-full text-[7px] font-black ${
                            recipientName === name
                              ? 'bg-purple-800 text-purple-200'
                              : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          }`}>
                            {privateMsgCount}
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Messages Outlet */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 bg-slate-950/5">
                {(() => {
                  const recentMessages = messages.filter((msg) => {
                    const ageMs = Date.now() - new Date(msg.timestamp).getTime();
                    if (ageMs >= 24 * 60 * 60 * 1000) return false;
                    
                    // Filter by selected recipientName
                    if (recipientName === 'All') {
                      // Broadcasts
                      return !msg.recipientName || msg.recipientName === 'All';
                    } else {
                      if (user?.username === 'developer') {
                        // Developer sees anything involving the selected cashier
                        return msg.senderName === recipientName || msg.recipientName === recipientName;
                      }
                      
                      // Direct Messages between me and recipientName
                      const isSenderRecipient = msg.senderName === recipientName && msg.recipientName === user?.name;
                      const isMeSending = msg.senderName === user?.name && msg.recipientName === recipientName;
                      return isSenderRecipient || isMeSending;
                    }
                  });
                  
                  if (recentMessages.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2.5 ${
                          darkMode ? 'bg-slate-800 text-slate-500' : 'bg-gray-100 text-gray-400'
                        }`}>
                          <Lock size={18} />
                        </div>
                        <p className="text-xs font-bold opacity-60">
                          {recipientName === 'All' ? 'Secure LAN Chat Room' : `Private Chat with ${recipientName}`}
                        </p>
                        <p className="text-[10px] opacity-40 max-w-[180px] mt-1 leading-normal">
                          {recipientName === 'All' 
                            ? 'Type a message below to broadcast encrypted text to all connected terminals.' 
                            : `All messages are E2EE encrypted. Type a message below to start a private conversation.`}
                        </p>
                      </div>
                    );
                  }
                  
                  return recentMessages.map((msg) => {
                    const isMe = user?.username === 'developer'
                      ? msg.senderName === 'System Support'
                      : msg.senderName === (user?.name || 'Cashier');
                    return (
                      <MessageBubble 
                        key={msg.id} 
                        msg={msg} 
                        isMe={isMe} 
                        cryptoKey={cryptoKey} 
                        fingerprint={keyFingerprint}
                        darkMode={darkMode}
                        onEdit={handleEditMessage}
                        onDelete={handleDeleteMessage}
                      />
                    );
                  });
                })()}
                <div ref={messagesEndRef} />
              </div>

              {/* Recipient Indicator */}
              <div className={`px-3 py-1.5 border-t flex items-center justify-between gap-2 text-[10px] flex-shrink-0 ${
                darkMode ? 'bg-slate-950/20 border-slate-800/80 text-slate-300' : 'bg-gray-50/50 border-gray-150 text-gray-600'
              }`}>
                <span className="font-black flex items-center gap-1 uppercase tracking-wider text-[8px] opacity-75">
                  <Users size={11} className="text-purple-400" />
                  Active Target:
                </span>
                <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider ${
                  recipientName === 'All'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/20'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/20'
                }`}>
                  {recipientName === 'All' ? '📣 All Registers (Broadcast)' : `👤 Private: ${recipientName}`}
                </span>
              </div>

              {/* Chat input */}
              <form 
                onSubmit={handleSendMessage}
                className={`p-3 border-t flex gap-2 flex-shrink-0 ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-150'
                }`}
              >
                <button
                  type="button"
                  onClick={handleShareCart}
                  title="Transfer active bill via secure E2EE chat"
                  className={`p-2 rounded-xl border flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                    darkMode
                      ? 'border-slate-800 bg-slate-950/60 text-purple-400 hover:bg-slate-850 hover:text-purple-300'
                      : 'border-gray-300 bg-gray-50 text-purple-600 hover:bg-gray-100 hover:text-purple-700'
                  }`}
                >
                  <Receipt size={14} />
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Send E2EE message..."
                  className={`flex-1 px-3 py-2 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/25 ${
                    darkMode ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-gray-300 placeholder-gray-400'
                  }`}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className={`p-2 rounded-xl text-white transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 ${
                    darkMode 
                      ? 'bg-purple-600 hover:bg-purple-500' 
                      : 'bg-purple-500 hover:bg-purple-600'
                  }`}
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

// 📦 Smart E2EE Decrypting Message Bubble Component
function MessageBubble({ 
  msg, 
  isMe, 
  cryptoKey, 
  fingerprint,
  darkMode,
  onEdit,
  onDelete
}: { 
  msg: ChatMessage; 
  isMe: boolean; 
  cryptoKey: CryptoKey | null; 
  fingerprint: string;
  darkMode: boolean;
  onEdit?: (id: string, newText: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [decryptionError, setDecryptionError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const handleStartEdit = () => {
    if (decryptedText !== null) {
      setEditText(decryptedText);
      setIsEditing(true);
    }
  };

  // Attempt client-side decryption whenever the key or message changes
  useEffect(() => {
    const decrypt = async () => {
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

        // Perform AES-GCM Decryption
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          ciphertext
        );

        const decoder = new TextDecoder();
        setDecryptedText(decoder.decode(decryptedBuffer));
        setDecryptionError(false);
      } catch (e) {
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

  // Parse decrypted payload to check if it's a cooperative LAN bill transfer
  let billData: any = null;
  if (decryptedText) {
    try {
      let cleanText = decryptedText.trim();
      
      // Handle cases where the text is double-enclosing quoted as a string
      if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
        try {
          cleanText = JSON.parse(cleanText);
        } catch {}
      }
      
      let parsed = JSON.parse(cleanText);
      
      // Resiliently resolve double/recursive stringification if React or WebSocket double-stringified the data
      let safetyCounter = 0;
      while (typeof parsed === 'string' && safetyCounter < 5) {
        parsed = JSON.parse(parsed);
        safetyCounter++;
      }
      
      if (parsed && typeof parsed === 'object') {
        if (parsed.type === 'BILL_TRANSFER' || parsed.isBillTransfer || Array.isArray(parsed.items)) {
          billData = parsed;
        }
      }
    } catch {
      // Just a normal text message
    }
  }

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full animate-fadeIn`}>
      {/* Sender name & role */}
      <span className={`text-[9px] font-bold mb-1 px-1 flex items-center gap-1.5 ${
        darkMode ? 'text-slate-400' : 'text-gray-500'
      }`}>
        {msg.senderName} 
        <span className={`text-[8px] px-1 rounded-sm ${
          msg.senderRole === 'Owner' 
            ? 'bg-red-500/10 text-red-400 font-black' 
            : msg.senderRole === 'Co-Owner' 
              ? 'bg-blue-500/10 text-blue-400 font-bold' 
              : 'bg-green-500/10 text-green-400'
        }`}>
          {msg.senderRole}
        </span>
        {msg.recipientName && msg.recipientName !== 'All' && (
          <span className="text-[8px] px-1 rounded-sm bg-purple-500/10 text-purple-400 font-bold flex items-center gap-0.5">
            🔒 Direct to {msg.recipientName}
          </span>
        )}
        {user?.username === 'developer' && decryptedText !== null && (
          <span className="flex items-center gap-1.5 ml-2 border-l border-slate-700/40 pl-2">
            {!billData && (
              <button
                type="button"
                onClick={handleStartEdit}
                title="Edit message (Developer override)"
                className="hover:text-purple-400 transition-colors cursor-pointer text-[8px]"
              >
                ✏️ Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this message?') && onDelete) {
                  onDelete(msg.id);
                }
              }}
              title="Delete message (Developer override)"
              className="hover:text-red-400 transition-colors cursor-pointer text-[8px]"
            >
              🗑️ Delete
            </button>
          </span>
        )}
      </span>

      {/* Message Box */}
      <div className={`p-3 rounded-2xl max-w-[85%] border shadow-sm transition-all ${
        isMe
          ? darkMode
            ? 'bg-purple-600/30 border-purple-500/20 text-purple-100 rounded-tr-none'
            : 'bg-purple-500 text-white border-purple-400 rounded-tr-none'
          : darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100 rounded-tl-none'
            : 'bg-gray-100 border-gray-200 text-gray-800 rounded-tl-none'
      }`}>
        {isEditing ? (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className={`w-full px-2 py-1 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-950/60 border border-slate-800/80 text-white`}
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  if (editText.trim() && onEdit) {
                    onEdit(msg.id, editText.trim());
                  }
                  setIsEditing(false);
                }}
                className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 rounded text-[9px] font-bold text-white transition-colors cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[9px] font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : decryptedText !== null ? (
          billData ? (
            /* 🔄 Bill Transfer Card */
            <div className="space-y-3 min-w-[200px] select-text">
              <div className="flex items-center gap-1.5 border-b border-purple-500/20 pb-1.5">
                <Receipt size={14} className={isMe ? 'text-purple-300' : 'text-purple-500'} />
                <span className="text-[10px] font-black uppercase tracking-wider">Bill Transfer</span>
              </div>
              <div className="space-y-1 text-[11px] opacity-90">
                <div className="flex justify-between">
                  <span>Cart Items:</span>
                  <span className="font-bold">{billData.items.length} items</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Value:</span>
                  <span className="font-bold text-emerald-400">₹{billData.total.toFixed(2)}</span>
                </div>
                {(billData.customerName || billData.customerPhone) && (
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <span className="font-semibold truncate max-w-[120px]">
                      {billData.customerName || billData.customerPhone}
                    </span>
                  </div>
                )}
              </div>
              
              {!isMe && (
                <button
                  type="button"
                  onClick={() => {
                    const event = new CustomEvent('load-shared-cart-trigger', { detail: billData });
                    window.dispatchEvent(event);
                  }}
                  className="w-full mt-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white font-bold text-[10px] rounded-lg tracking-wider uppercase transition-all hover:scale-[1.02] active:scale-95 shadow cursor-pointer text-center"
                >
                  Accept Bill
                </button>
              )}
              {isMe && (
                <p className="text-[9px] opacity-45 italic text-right mt-1.5">📤 Shared on LAN register</p>
              )}
            </div>
          ) : (
            /* ✅ Decryption Success */
            <p className="text-xs break-words leading-relaxed select-text font-medium">{decryptedText}</p>
          )
        ) : decryptionError ? (
          /* ❌ Decryption Failure (Key mismatch or missing key) */
          <div className="space-y-1.5 select-text">
            <p className="text-[10px] text-red-500 dark:text-red-400 font-black flex items-center gap-1">
              <ShieldAlert size={11} />
              Decryption Failed (Key Mismatch)
            </p>
            <div className={`p-1.5 rounded text-[8px] font-mono break-all leading-normal ${
              darkMode ? 'bg-slate-950/80 text-red-400/80' : 'bg-red-50 text-red-600/80'
            }`}>
              {msg.ciphertext.slice(0, 48)}...
            </div>
            <p className="text-[8px] opacity-40 leading-normal">
              Sender key: <code className="font-bold">{msg.fingerprint}</code>
            </p>
          </div>
        ) : (
          /* ⏳ Decrypting... */
          <p className="text-xs italic opacity-55 animate-pulse">Decrypting package...</p>
        )}
      </div>

      {/* Timestamp & E2EE badge */}
      <div className="flex items-center gap-1.5 mt-1 px-1">
        <span className={`text-[8px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{timeString}</span>
        {decryptedText !== null && (
          <span 
            title={`E2EE derived key: ${msg.fingerprint}`}
            className="flex items-center gap-0.5 text-[8px] font-black text-emerald-500 dark:text-emerald-400 tracking-wider uppercase"
          >
            <ShieldCheck size={10} />
            E2EE
          </span>
        )}
      </div>
    </div>
  );
}
