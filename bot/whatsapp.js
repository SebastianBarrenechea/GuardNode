import Lockfile from 'pidlockfile';
import fs from 'fs-extra';
import { config } from '../utils/config.js';
import { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  makeInMemoryStore,
  WAConnectionState
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { config } from '../utils/config.js';
import logger, { logEvent } from '../utils/logger.js';
import { analyzeText } from '../moderation/analyzer.js';
import { antiFP } from '../moderation/antifp.js';
import { saveMediaLocal } from '../utils/media.js';
import LRU from 'lru-cache';
import { createInfraction } from '../database/models/infractions.js';
import { isBanned } from '../database/models/bans.js';

import { getConfig } from '../utils/config.js';

export class WhatsAppBot {
  constructor(config) {
    this.config = config;
    this.sock = null;
    this.store = makeInMemoryStore({});
    this.retryCount = 0;
    this.maxRetries = Infinity;
    this.processedMessages = new LRU({
      max: 10000,
      ttl: 60000
    });
    this.connectionWatchdog = null;
    this.lockfile = null;
    this.healthInterval = null;
    this.pingInterval = null;
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionPath);
    
    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      generateHighQualityLinkPreview: false,
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadataVersion: 2,
                  deviceListMetadata: {},
                },
                ...message,
              },
            },
          };
        }
        return message;
      },
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', this.onConnectionUpdate.bind(this));
    this.sock.ev.on('messages.upsert', this.onMessagesUpsert.bind(this));
    this.sock.ev.on('group-participants.update', this.onGroupUpdate.bind(this));

    logger.info(`🤖 WhatsApp Bot initialized for group: ${this.config.group_id}`);
  }

  startWatchdog() {
    if (this.connectionWatchdog) clearInterval(this.connectionWatchdog);
    this.connectionWatchdog = setInterval(async () => {
      if (this.sock && !this.sock.user) {
        logger.warn('🔍 Watchdog: No user session, reconnecting...');
        await this.connect();
      }
    }, 30000); // 30s
  }

  startWatchdog() {
    if (this.connectionWatchdog) clearInterval(this.connectionWatchdog);
    this.connectionWatchdog = setInterval(async () => {
      if (this.sock && !this.sock.user) {
        logger.warn('🔍 Watchdog: No user session, reconnecting...');
        await this.connect();
      }
    }, 30000); // 30s
  }

  async disconnect() {
    if (this.connectionWatchdog) {
      clearInterval(this.connectionWatchdog);
      this.connectionWatchdog = null;
    }
    if (this.sock) {
      await this.sock.end();
    }
  }

  onConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.error('Connection closed:', lastDisconnect?.error);
      
      if (shouldReconnect) {
        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 60000); // cap at 60s
        logger.warn(`🔄 Reconnect #${this.retryCount} in ${delay/1000}s`);
        setTimeout(() => this.connect(), delay);
      } else {
        logger.error('Logged out. Delete sessions folder and restart.');
      }
    } else if (connection === 'open') {
      this.retryCount = 0;
      logger.success('✅ WhatsApp connected');
      // Start watchdog
      this.startWatchdog();
    } else if (update.qr) {
      qrcode.generate(update.qr, { small: true });
      logger.info('📱 Scan QR code above');
    }
  }

  async onMessagesUpsert({ messages }) {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe || this.processedMessages.has(msg.key.id)) return;
    this.processedMessages.set(msg.key.id, true);

    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return;

    const groupId = msg.key.remoteJid;
    
    // SINGLE GROUP RESTRICTION - CRITICAL
    if (groupId !== this.config.group_id) {
      return; // Ignore all other groups
    }
    
    const phone = msg.key.participant || msg.key.remoteJid.split(':')[0] || 'unknown';
    
    try {
      // Extract message data
      const messageData = await this.parseMessage(msg.message, phone, groupId);
      if (!messageData) return;

      logEvent('message_received', { phone, groupId, type: messageData.type });

      // Check for rejoin bans
      const ban = await isBanned(phone, groupId);
      if (ban) {
        await this.kickUser(groupId, phone);
        logger.warn(`🚫 Auto-kick banned rejoin: ${phone}`);
        return;
      }

      // Analyze if it's moderateable content
      if (messageData.type === 'text') {
        const analysis = await analyzeText(phone, messageData.content);
        logEvent('ai_analysis', { phone, label: analysis?.label, confidence: analysis?.confidence, reason: analysis?.reason });
        if (analysis?.label === 'VIOLATION') {
          const result = await antiFP.processViolation(phone, groupId, analysis, messageData);
          logEvent('moderation_action', { phone, action: result.action, strikeCount: result.strikeCount });
          
          if (result.action === 'kick' || result.action === 'ban') {
            // Random delay 2-10s
            const delay = 2000 + Math.random() * 8000;
            setTimeout(async () => {
              await this.deleteMessage(msg.key);
              await this.kickUser(groupId, phone);
            }, delay);
          }
        }
      } else {
        // Media: log for review, upload to FTP
        if (messageData.mediaUrl) {
          await createInfraction({
            ...messageData,
            confidence: 50, // Manual review needed
            reason: 'media_pending_ai'
          });
        }
      }
    } catch (error) {
      logger.error('Message processing error:', error);
    }
  }

  async onGroupUpdate(update) {
    const { id, participants, action } = update;
    
    if (action === 'add') {
      for (const phone of participants) {
        // Check if new member is banned
        const ban = await isBanned(phone, id);
        if (ban) {
          setTimeout(async () => {
            await this.kickUser(id, phone);
            logger.warn(`🚫 Banned member added: ${phone}`);
          }, 3000); // Wait for join to complete
        }
      }
    }
  }

  async parseMessage(message, phone, groupId) {
    try {
      if (message.conversation) {
        return {
          phone,
          groupId,
          content: message.conversation,
          type: 'text'
        };
      }

      if (message.extendedTextMessage?.text) {
        return {
          phone,
          groupId,
          content: message.extendedTextMessage.text,
          type: 'text'
        };
      }

      // Image
      if (message.imageMessage) {
        const buffer = await this.sock.downloadMediaMessage(msg);
        const url = await saveMediaLocal(buffer, `img_${Date.now()}.jpg`, 'image/jpeg');
        return {
          phone,
          groupId,
          mediaUrl: url,
          type: 'image'
        };
      }

      // Video
      if (message.videoMessage) {
        const buffer = await this.sock.downloadMediaMessage(msg);
        const url = await saveMediaLocal(buffer, `vid_${Date.now()}.mp4`, 'video/mp4');
        return {
          phone,
          groupId,
          mediaUrl: url,
          type: 'video'
        };
      }

      // GIF/Sticker
      if (message.gifPlaybackMessage || message.stickerMessage) {
        const buffer = await this.sock.downloadMediaMessage(msg);
        const contentType = message.gifPlaybackMessage ? 'image/gif' : 'image/webp';
        const ext = message.gifPlaybackMessage ? '.gif' : '.webp';
        const url = await saveMediaLocal(buffer, `media_${Date.now()}${ext}`, contentType);
        return {
          phone,
          groupId,
          mediaUrl: url,
          type: message.gifPlaybackMessage ? 'gif' : 'sticker'
        };
      }

      return null;
    } catch (error) {
      logger.error('Parse message failed:', error);
      return null;
    }
  }

  async kickUser(groupId, phone) {
    try {
      await this.sock!.groupParticipantsUpdate(groupId, [phone], 'remove');
    } catch (error) {
      logger.error(`Kick failed ${phone}:`, error.message);
    }
  }

  async deleteMessage(key) {
    try {
      await this.sock!.sendMessage(key.remoteJid, { delete: key });
    } catch (error) {
      logger.debug('Delete failed:', error.message);
    }
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.end();
    }
  }
}

