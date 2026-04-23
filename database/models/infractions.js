import Database from '../connection.js';
import logger from '../../utils/logger.js';

const db = Database.getInstance();

// Prepared statements for performance
const insertStmt = db.prepare(`
  INSERT INTO infractions (phone, group_id, content, media_url, type, reason, confidence, strike_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const recentStrikesStmt = db.prepare(`
  SELECT 
    COUNT(*) as count, 
    MAX(strike_count) as max_strike
  FROM infractions 
  WHERE phone = ? AND group_id = ? AND created_at > datetime('now', '-? days')
`);

const userContextStmt = db.prepare(`
  SELECT content, media_url, type, reason, confidence, created_at
  FROM infractions 
  WHERE phone = ? AND group_id = ?
  ORDER BY created_at DESC 
  LIMIT ?
`);

const getInfractionsStmtBase = db.prepare(`
  SELECT * FROM infractions 
  WHERE 1=1 [[AND group_id = ?]] [[AND phone = ?]]
  ORDER BY created_at DESC 
  LIMIT ? OFFSET ?
`);

export function createInfraction(data) {
  const {
    phone,
    group_id,
    content,
    media_url,
    type,
    reason,
    confidence,
    strike_count = 1
  } = data;

  try {
    const result = insertStmt.run(
      phone,
      group_id,
      content || null,
      media_url || null,
      type,
      reason || null,
      confidence || null,
      strike_count
    );
    logger.info(`Infraction recorded: ${phone} in ${group_id}`);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to create infraction:', error);
    throw error;
  }
}

export function getRecentStrikes(phone, group_id, days = 7) {
  return recentStrikesStmt.get(phone, group_id, days);
}

export function getUserContext(phone, group_id, limit = 3) {
  return userContextStmt.all(phone, group_id, limit);
}

export function getInfractions({ group_id, phone, limit = 50, offset = 0 }) {
  let sql = 'SELECT * FROM infractions WHERE 1=1';
  const params = [];

  if (group_id) {
    sql += ' AND group_id = ?';
    params.push(group_id);
  }
  if (phone) {
    sql += ' AND phone = ?';
    params.push(phone);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params);
}
