#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import Database from './connection.js';
import logger from '../utils/logger.js';

async function migrate() {
  try {
    const db = Database.getInstance();
    
    // Read and execute schema
    const schemaPath = path.join(process.cwd(), 'database/schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    
    // Split statements and execute idempotently
    const statements = schemaSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (error) {
        // Ignore errors for idempotent ops (IF NOT EXISTS)
        if (!error.message.includes('already exists')) {
          logger.warn('Migration warning:', error.message.slice(0, 100));
        }
      }
    }
    
    logger.success('✅ Database migrated successfully');
    logger.info('Tables: config, infractions, bans');
    
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
