import Database from '../connection.js';
import logger from '../../utils/logger.js';

const db = Database.getInstance();

// Prepared statements
const insertBanStmt = db.prepare(`
  INSERT OR IGNORE INTO bans (phone, group_id, reason, trigger_content, media_url, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const isBannedStmt = db.prepare(`
  SELECT * FROM bans 
  WHERE phone = ? AND group_id = ? AND expires_at > datetime('now')
`);

const deleteBanStmt = db.prepare('DELETE FROM bans WHERE id = ?');

const getActiveBansStmtBase = db.prepare(`
  SELECT * FROM bans 
  WHERE expires_at > datetime('now') [[AND group_id = ?]]
  ORDER BY created_at DESC 
  LIMIT ? OFFSET ?
`);

export function createBan(data) {
  const {
    phone,
    group_id,
    reason,
    trigger_content,
    media_url
  } = data;

  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const result = insertBanStmt.run(
      phone,
      group_id,
      reason,
      trigger_content,
      media_url,
      expires_at
    );
    
    if (result.changes > 0) {
      logger.warn(`🚫 User banned: ${phone} from ${group_id} - ${reason}`);
    } else {
      logger.info(`Ban already exists: ${phone} in ${group_id}`);
    }
  } catch (error) {
    logger.error('Failed to create ban:', error);
    throw error;
  }
}

export function isBanned(phone, group_id) {
  return isBannedStmt.get(phone, group_id);
}

export function deleteBan(id) {
  const result = deleteBanStmt.run(id);
  if (result.changes > 0) {
    logger.info(`Ban removed: ID ${id}`);
  }
  return result.changes;
}

export function getActiveBans({ group_id, limit = 50, offset = 0 }) {
  let sql = 'SELECT * FROM bans WHERE expires_at > datetime(\'now\')';
  const params = [];

  if (group_id) {
    sql += ' AND group_id = ?';
    params.push(group_id);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params);
}

export function cleanupExpiredBans() {
  const result = db.prepare('DELETE FROM bans WHERE expires_at <= datetime(\'now\')').run();
  logger.info(`Cleaned ${result.changes} expired bans`);
}
