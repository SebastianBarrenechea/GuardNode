import logger from './utils/logger.js';
import { WhatsAppBot } from './bot/whatsapp.js';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { isFirstRun } from './database/models/config.js';
import { migrate } from './database/migrate.js';
import Database from './database/connection.js';
import { cleanupExpiredBans } from './database/models/bans.js';
import { getConfig } from './utils/config.js'; // Updated config

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down gracefully...');
  await gracefulShutdown();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('💥 Uncaught Exception:', err);
  gracefulShutdown().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown().then(() => process.exit(1));
});

let bot;
let apiServer;

async function main() {
  logger.info('🚀 Starting WhatsApp Moderation Bot...');
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // 1. FIRST RUN CHECK - MANDATORY SETUP
  const firstRun = await isFirstRun();
  if (firstRun) {
    logger.warn('⚠️  First run detected! Running setup...');
    console.log('\n🚀 Welcome! Initial setup required.');
    console.log('Run: npm install && npm run setup');
    console.log('Then restart: node index.js');
    process.exit(1);
  }

  // 2. Migrate DB schema
  logger.info('📊 Migrating database...');
  await migrate();

  // 3. Load config from DB
  const config = await getConfig();
  logger.info(`👥 Config loaded: Group ${config.group_id.slice(0,20)}...`);
  logger.info(`📱 Admin: ${config.admin_phone.slice(-10)}`);

  // 4. Initialize WhatsApp Bot
  bot = new WhatsAppBot(config);
  await bot.connect();

  // 5. Start API/Dashboard (pass config)
  const apiModule = await import('./api/server.js');
  apiServer = apiModule.default.listen(3001, () => {
    logger.info('🌐 Dashboard ready: http://localhost:3001/dashboard');
  });

  // 6. Cleanup cron: hourly
  cron.schedule('0 * * * *', cleanupExpiredBans);
  logger.success('✅ Bot fully operational - Single group moderation active!');
}

async function gracefulShutdown() {
  logger.info('🔄 Graceful shutdown...');
  
  if (apiServer) {
    apiServer.close();
    logger.info('🌐 API closed');
  }
  
  if (bot) {
    await bot.disconnect();
    logger.info('🤖 WhatsApp disconnected');
  }
  
  Database.close(); // From connection.js
}

main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});

