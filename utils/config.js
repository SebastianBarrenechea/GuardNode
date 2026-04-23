import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { getConfig } from '../database/models/config.js';
import logger from './logger.js';

dotenv.config();

let cachedConfig = null;

export async function getConfig() {
  if (cachedConfig) return cachedConfig;

  // VPS Production paths - absolute for PM2/systemd
  const appDir = process.env.APP_DIR || path.join(process.cwd(), '..'); // /opt/bo parent
  const vpsPaths = {
    uploads: {
      path: process.env.UPLOADS_PATH || path.join(appDir, 'uploads'),
      maxSizeMB: parseInt(process.env.MAX_UPLOAD_MB) || 50
    },
    sessionPath: process.env.SESSION_PATH || path.join(appDir, 'sessions'),
    logPath: process.env.LOG_PATH || path.join(appDir, 'logs'),
    dbPath: process.env.DB_PATH || path.join(appDir, 'whatsapp_moderation.db')
  };

  const envConfig = {
    port: parseInt(process.env.PORT) || 3001,
    ...vpsPaths,
    ollama: {
      url: process.env.OLLAMA_URL || 'http://localhost:11434',
      model: process.env.MISTRAL_MODEL || 'mistral:7b-instruct'
    },
    whitelist: (process.env.WHITELIST_PHONES || '').split(',').map(p => p.trim()).filter(Boolean),
    nodeEnv: process.env.NODE_ENV || 'production',
    clusterMode: process.env.CLUSTER_MODE === 'true',
    appDir: appDir
  };

  try {
    const dbConfig = await getConfig();
    cachedConfig = {
      ...envConfig,
      group_id: dbConfig.group_id,
      admin_phone: dbConfig.admin_phone,
      dashboard_user: dbConfig.dashboard_user,
      dashboard_password_hash: dbConfig.dashboard_password_hash
    };
    
    logger.info(`⚙️ VPS Config: ${appDir} (${envConfig.nodeEnv})`);
    return cachedConfig;
  } catch (error) {
    logger.error('DB config failed:', error.message);
    logger.warn('Using ENV-only config (limited functionality)');
    return envConfig;
  }
}

export function clearConfigCache() {
  cachedConfig = null;
}

// Healthcheck config
export function getHealthConfig() {
  return {
    nodeVersion: process.version,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    platform: os.platform(),
    pid: process.pid
  };
}

