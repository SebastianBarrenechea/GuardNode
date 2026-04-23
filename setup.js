#!/usr/bin/env node
import readlineSync from 'readline-sync';
import logger from './utils/logger.js';
import { isFirstRun, createInitialConfig } from './database/models/config.js';
import Database from './database/connection.js';
import { migrate } from './database/migrate.js';
import path from 'path';
import fs from 'fs-extra';

async function runSetup() {
  logger.info('🔧 Initial Setup - WhatsApp Moderation Bot');
  logger.info('=======================================');

  // Connect DB early
  const db = Database.getInstance();
  
  // Check if first run
  const firstRun = await isFirstRun();
  if (!firstRun) {
    logger.info('✅ Already configured. Run `node index.js`');
    process.exit(0);
  }

  // Migrate schema first
  logger.info('📊 Running database migration...');
  await migrate(); // Note: migrate.js needs to be called properly

  console.log('\n📱 1. Admin Phone Number (international format, e.g. 5511999999999)');
  const adminPhone = readlineSync.question('Admin Phone: ', {
    limit: /^[\d+]{10,20}$/i,
    limitMessage: 'Invalid format! Use international number (e.g. 5511999999999)'
  });

  console.log('\n👥 2. Target Group ID (get from WhatsApp Web URL or /groupinfo)');
  const groupId = readlineSync.question('Group ID (ends with @g.us): ', {
    limit: /.*@g\.us$/,
    limitMessage: 'Must end with @g.us (e.g. 1234567890-123456789@g.us)'
  });

  console.log('\n🖥️  3. Dashboard Username');
  const dashUser = readlineSync.question('Username: ', {
    limit: /^.{3,50}$/,
    limitMessage: '3-50 characters'
  });

  console.log('\n🔐 4. Dashboard Password (min 6 chars)');
  const dashPass = readlineSync.question('Password: ', {
    hideEchoBack: true,
    mask: '',
    limit: /^.{6,100}$/,
    limitMessage: 'Min 6 characters'
  });

  const adminData = { admin_phone: adminPhone, group_id: groupId, dashboard_user: dashUser, dashboard_password: dashPass };

  try {
    await createInitialConfig(adminData);
    logger.success('\n🎉 Setup COMPLETE!');
    logger.success('Next steps:');
    logger.info('1. npm install');
    logger.info('2. node index.js');
    logger.info('3. Scan QR code');
    logger.info('4. Access dashboard: http://localhost:3001/dashboard');
  } catch (error) {
    logger.error('Setup failed:', error.message);
    process.exit(1);
  }
}

runSetup();
