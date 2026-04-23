import pino from 'pino';
import rfs from 'rotating-file-stream';
import path from 'path';
import fs from 'fs-extra';

// Ensure logs dir
const LOG_DIR = process.env.LOG_PATH || './logs';
fs.ensureDirSync(path.join(process.cwd(), LOG_DIR));

// Rotating stream: 10MB x 30 files = ~300MB total
const fileStream = rfs.createStream('app.log', {
  size: '10M',
  interval: '1d',
  compress: 'gzip',
  maxFiles: 30,
  path: path.join(process.cwd(), LOG_DIR)
});

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Dual transport: file + stdout (PM2/systemd)
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          colorize: process.env.NODE_ENV !== 'production',
          levelFirst: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      },
      {
        target: 'pino/file',
        options: {},
        stream: fileStream
      }
    ]
  },
  base: {
    service: 'whatsapp-moderation',
    hostname: process.env.HOSTNAME || 'vps-bot',
    version: '1.1.0'
  }
});

export default logger;

export const logEvent = (event, data) => {
  logger.info({
    event,
    timestamp: new Date().toISOString(),
    ...data
  });
};

