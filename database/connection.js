import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import logger from '../utils/logger.js';

class DatabaseSingleton {
  constructor() {
    const dbPath = path.join(process.cwd(), 'whatsapp_moderation.db');
    
    // Ensure DB dir exists
    fs.ensureDirSync(path.dirname(dbPath));
    
    this.db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      timeout: 15000
    });
    
    // Enable foreign keys and WAL mode for concurrency
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    
    logger.info(`✅ SQLite connected: ${dbPath}`);
  }
  
  getInstance() {
    return this.db;
  }
  
  close() {
    if (this.db) {
      this.db.close();
      logger.info('🛑 SQLite closed');
    }
  }
}

const DatabaseInstance = new DatabaseSingleton();
export default DatabaseInstance;
