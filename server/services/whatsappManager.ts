import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Session storage directory on disk
const AUTH_DIR = path.join(__dirname, '..', '..', 'server', 'data', 'whatsapp-auth');

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected';

export interface WhatsAppState {
  status: WhatsAppStatus;
  qrDataUrl: string | null;
  qrRaw: string | null;
  connectedNumber: string | null;
  connectedName: string | null;
  connectedAt: string | null;
  lastError: string | null;
}

class WhatsAppManager {
  private sock: WASocket | null = null;
  private status: WhatsAppStatus = 'disconnected';
  private qrDataUrl: string | null = null;
  private qrRaw: string | null = null;
  private connectedNumber: string | null = null;
  private connectedName: string | null = null;
  private connectedAt: string | null = null;
  private lastError: string | null = null;
  private isConnecting: boolean = false;
  private broadcastCallback: ((data: any) => void) | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureAuthDir();
    // If existing valid session exists on disk, auto-connect in the background
    setTimeout(() => {
      if (this.hasExistingSession()) {
        console.log('🔄 [WhatsApp Web] Existing session detected on disk. Auto-connecting...');
        this.startSession(false).catch(err => {
          console.warn('⚠️ [WhatsApp Web] Auto-reconnect failed on startup:', err.message);
        });
      }
    }, 3000);
  }

  private ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
  }

  public hasExistingSession(): boolean {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    return fs.existsSync(credsPath);
  }

  public setBroadcast(fn: (data: any) => void) {
    this.broadcastCallback = fn;
  }

  private broadcastUpdate() {
    if (this.broadcastCallback) {
      this.broadcastCallback({
        type: 'WHATSAPP_STATUS_CHANGED',
        data: this.getState(),
      });
    }
  }

  public getState(): WhatsAppState {
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      qrRaw: this.qrRaw,
      connectedNumber: this.connectedNumber,
      connectedName: this.connectedName,
      connectedAt: this.connectedAt,
      lastError: this.lastError,
    };
  }

  public async startSession(forceNewQr = false): Promise<WhatsAppState> {
    if (this.status === 'connected' && this.sock) {
      return this.getState();
    }

    // If QR code is already generated and ready, return it immediately without re-initializing
    if (this.status === 'qr_ready' && this.qrDataUrl && !forceNewQr) {
      return this.getState();
    }

    if (forceNewQr) {
      await this.disconnectSession(true);
    }

    if (!this.isConnecting) {
      this.ensureAuthDir();
      this.isConnecting = true;
      this.status = 'connecting';
      this.lastError = null;
      this.broadcastUpdate();

      try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        if (this.sock) {
          try {
            this.sock.ev.removeAllListeners('connection.update');
            this.sock.ev.removeAllListeners('creds.update');
            this.sock.end(undefined);
          } catch {
            // ignore
          }
          this.sock = null;
        }

        const sock = makeWASocket({
          auth: state,
          logger: pino({ level: 'silent' }),
          printQRInTerminal: false,
          browser: Browsers.macOS('NexusFlow POS'),
          connectTimeoutMs: 60_000,
          defaultQueryTimeoutMs: 60_000,
        });

        this.sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            try {
              const dataUrl = await QRCode.toDataURL(qr, {
                margin: 2,
                scale: 6,
                color: { dark: '#0b141a', light: '#ffffff' },
              });
              this.status = 'qr_ready';
              this.qrRaw = qr;
              this.qrDataUrl = dataUrl;
              this.isConnecting = false;
              console.log('📲 [WhatsApp Web] Fresh pairing QR code generated. Ready to scan.');
              this.broadcastUpdate();
            } catch (e: any) {
              console.error('Failed to convert WhatsApp QR to data URL:', e);
            }
          }

          if (connection === 'open') {
            this.status = 'connected';
            this.isConnecting = false;
            this.qrDataUrl = null;
            this.qrRaw = null;
            this.connectedAt = new Date().toISOString();
            this.lastError = null;

            const rawId = sock.user?.id || '';
            const cleanPhone = rawId.split(':')[0].replace(/\D/g, '') || rawId.split('@')[0].replace(/\D/g, '');
            this.connectedNumber = cleanPhone;
            this.connectedName = sock.user?.name || 'Shop Counter WhatsApp';

            console.log(`✅ [WhatsApp Web] Shop account paired successfully: +${this.connectedNumber} (${this.connectedName})`);
            this.broadcastUpdate();
          }

          if (connection === 'close') {
            this.isConnecting = false;
            const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;

            console.warn(`⚠️ [WhatsApp Web] Connection closed (code ${statusCode}). Logged out: ${isLoggedOut}`);

            if (isLoggedOut) {
              this.status = 'disconnected';
              this.connectedNumber = null;
              this.connectedName = null;
              this.connectedAt = null;
              this.qrDataUrl = null;
              this.qrRaw = null;
              this.lastError = 'Device was unlinked or logged out from phone.';
              this.clearAuthDir();
              this.broadcastUpdate();
            } else {
              // Transient network disconnect, attempt auto-reconnect after 3s
              this.status = 'connecting';
              this.lastError = 'Reconnecting to WhatsApp network...';
              this.broadcastUpdate();

              if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
              this.reconnectTimeout = setTimeout(() => {
                if (this.hasExistingSession()) {
                  console.log('🔄 [WhatsApp Web] Re-establishing WhatsApp socket connection...');
                  this.startSession(false).catch(err => {
                    console.warn('Reconnect error:', err.message);
                  });
                } else {
                  this.status = 'disconnected';
                  this.broadcastUpdate();
                }
              }, 3000);
            }
          }
        });
      } catch (err: any) {
        this.isConnecting = false;
        this.status = 'disconnected';
        this.lastError = err.message || 'Failed to initialize WhatsApp connection';
        console.error('Error starting WhatsApp session:', err);
        this.broadcastUpdate();
        return this.getState();
      }
    }

    // Wait up to 5 seconds for QR code or connected state so HTTP caller receives it directly
    return await new Promise<WhatsAppState>((resolve) => {
      if (this.status === 'qr_ready' || this.status === 'connected') {
        return resolve(this.getState());
      }

      const startTime = Date.now();
      const interval = setInterval(() => {
        if (this.status === 'qr_ready' || this.status === 'connected' || Date.now() - startTime > 5000) {
          clearInterval(interval);
          resolve(this.getState());
        }
      }, 100);
    });
  }

  public async disconnectSession(deleteAuth = true): Promise<WhatsAppState> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        if (deleteAuth) {
          try {
            await this.sock.logout();
          } catch {
            // ignore
          }
        }
        this.sock.end(undefined);
      } catch (e: any) {
        console.warn('Socket termination note:', e.message);
      }
      this.sock = null;
    }

    if (deleteAuth) {
      this.clearAuthDir();
    }

    this.status = 'disconnected';
    this.qrDataUrl = null;
    this.qrRaw = null;
    this.connectedNumber = null;
    this.connectedName = null;
    this.connectedAt = null;
    this.lastError = null;
    this.isConnecting = false;

    console.log('🔌 [WhatsApp Web] Session disconnected and unlinked.');
    this.broadcastUpdate();
    return this.getState();
  }

  private clearAuthDir() {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
    } catch (e: any) {
      console.error('Failed to clear WhatsApp auth directory:', e.message);
    }
  }

  public sanitizePhone(phone: string, defaultCountry = '91'): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) {
      return `${defaultCountry}${digits}`;
    }
    if (digits.startsWith('0') && digits.length === 11) {
      return `${defaultCountry}${digits.slice(1)}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits;
    }
    return digits;
  }

  public async sendDirectMessage(recipientPhone: string, messageText: string): Promise<{
    success: boolean;
    messageId: string;
    phone: string;
    timestamp: number;
    shopPhone: string;
  }> {
    if (this.status !== 'connected' || !this.sock) {
      throw new Error('Shop WhatsApp is not linked. Please scan the QR code in Settings to connect your shop WhatsApp.');
    }

    const cleanPhone = this.sanitizePhone(recipientPhone);
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new Error('Invalid customer phone number format.');
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;

    // Verify if customer number exists on WhatsApp
    try {
      const results = await this.sock.onWhatsApp(jid);
      if (results && results.length > 0 && !results[0].exists) {
        throw new Error(`Customer phone +${cleanPhone} is not registered on WhatsApp.`);
      }
    } catch (checkErr: any) {
      // If check fails due to timeout or protocol difference, proceed to send directly
      if (checkErr.message && checkErr.message.includes('not registered')) {
        throw checkErr;
      }
    }

    // Send the message directly through the Baileys multi-device socket
    const sent = await this.sock.sendMessage(jid, {
      text: messageText,
    });

    const msgId = sent?.key?.id || `wa_${Date.now()}`;

    console.log(`📨 [WhatsApp Web] Bill receipt sent to customer +${cleanPhone} (Msg ID: ${msgId})`);

    return {
      success: true,
      messageId: msgId,
      phone: cleanPhone,
      timestamp: Date.now(),
      shopPhone: this.connectedNumber || 'Shop WhatsApp',
    };
  }
}

export const whatsappManager = new WhatsAppManager();
