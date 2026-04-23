import Database from '../connection.js';
import bcrypt from 'bcryptjs';
import logger from '../../utils/logger.js';

const db = Database.getInstance();

export async function getConfig() {
  try {
    const config = db.prepare(`
      SELECT * FROM config WHERE id = 1
    `).get();
    
    if (!config) {
      throw new Error('Config not initialized. Run setup first.');
    }
    
    return {
      admin_phone: config.admin_phone,
      group_id: config.group_id,
      dashboard_user: config.dashboard_user,
      dashboard_password_hash: config.dashboard_password_hash
    };
  } catch (error) {
    logger.error('Failed to get config:', error.message);
    throw error;
  }
}

export async function isFirstRun() {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM config').get();
    return row.count === 0;
  } catch (error) {
    return true; // Assume first run if DB error
  }
}

export async function createInitialConfig(adminData) {
  const { admin_phone, group_id, dashboard_user, dashboard_password } = adminData;
  
  // Validate inputs
  if (!admin_phone || !admin_phone.startsWith('55') && !admin_phone.startsWith('34')) {
    throw new Error('Invalid admin phone format (use international format)');
  }
  if (!group_id || !group_id.endsWith('@g.us')) {
    throw new Error('Invalid group_id (must end with @g.us)');
  }
  if (!dashboard_user || dashboard_user.length < 3) {
    throw new Error('Dashboard user must be at least 3 chars');
  }
  if (!dashboard_password || dashboard_password.length < 6) {
    throw new Error('Password must be at least 6 chars');
  }

  const salt = await bcrypt.genSalt(12);
  const password_hash = await bcrypt.hash(dashboard_password, salt);

  try {
    db.prepare(`
      INSERT INTO config (admin_phone, group_id, dashboard_user, dashboard_password_hash)
      VALUES (?, ?, ?, ?)
    `).run(admin_phone, group_id, dashboard_user, password_hash);
    
    logger.success('✅ Initial config created');
    return true;
  } catch (error) {
    logger.error('Failed to create config:', error);
    throw error;
  }
}

export async function validateDashboardAuth(username, password) {
  try {
    const config = await getConfig();
    if (username !== config.dashboard_user) {
      return false;
    }
    return await bcrypt.compare(password, config.dashboard_password_hash);
  } catch (error) {
    return false;
  }
}
