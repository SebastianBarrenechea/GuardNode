import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { getConfig, getHealthConfig } from '../utils/config.js';
import logger from '../utils/logger.js';
import { getInfractions } from '../database/models/infractions.js';
import { getActiveBans, deleteBan } from '../database/models/bans.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// Production security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"]
    }
  }
}));

// Body parsing with limits
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Static with security
app.use('/media', express.static(process.cwd() + '/uploads', { 
  maxAge: '1d',
  etag: false 
}));
app.use('/dashboard', express.static(path.join(__dirname, '../../dashboard/public')));

// CORS VPS (NGINX proxy)
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting enhanced
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Rate limit exceeded',
  standardHeaders: true
});
app.use('/api/', apiLimiter);

// Session secure
app.use(session({
  secret: process.env.SESSION_SECRET || 'whatsapp-moderation-vps',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24*60*60*1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Input sanitization
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return '';
  return sanitizeHtml(str, {
    allowedTags: [],
    allowedAttributes: {}
  });
};

// HEALTHCHECK - CRÍTICO VPS
app.get('/health', (req, res) => {
  const health = getHealthConfig();
  health.whatsapp = !!bot?.sock?.user;
  health.status = 'healthy';
  
  logger.info('Healthcheck', health);
  res.json(health);
});

// Routes
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Sanitize + validate
  const cleanUser = sanitizeInput(username || '');
  const cleanPass = password ? password.substring(0,100) : '';
  
  if (!cleanUser || !cleanPass || cleanUser.length > 50) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  
  try {
    const config = await getConfig();
    if (await bcrypt.compare(cleanPass, config.dashboard_password_hash) &&
        cleanUser === config.dashboard_user) {
      req.session.authenticated = true;
      req.session.user = cleanUser;
      logger.info(`Login success: ${cleanUser}`);
      res.json({ success: true });
    } else {
      logger.warn(`Login failed: ${cleanUser}`);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/bans', requireAuth, async (req, res) => {
  const { group_id, phone, limit = 50, offset = 0 } = req.query;
  try {
    const cleanGroup = sanitizeInput(group_id || '');
    const cleanPhone = sanitizeInput(phone || '');
    
    const bans = await getActiveBans({ 
      group_id: cleanGroup, 
      phone: cleanPhone,
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
    res.json(bans);
  } catch (error) {
    logger.error('Bans API error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/infractions', requireAuth, async (req, res) => {
  const { group_id, phone, limit = 50, offset = 0 } = req.query;
  try {
    const cleanGroup = sanitizeInput(group_id || '');
    const cleanPhone = sanitizeInput(phone || '');
    
    const infractions = await getInfractions({ 
      group_id: cleanGroup, 
      phone: cleanPhone,
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
    res.json(infractions);
  } catch (error) {
    logger.error('Infractions API error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bans/:id', requireAuth, async (req, res) => {
  try {
    const cleanId = parseInt(req.params.id);
    if (!cleanId) return res.status(400).json({ error: 'Invalid ID' });
    
    await deleteBan(cleanId);
    logger.info(`Ban deleted by ${req.session.user}: ID ${cleanId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete ban error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', requireAuth, async (req, res) => {
  try {
    const config = await getConfig();
    res.json({
      whatsapp: !!bot?.sock?.user,
      groups: [config.group_id],
      uptime: process.uptime(),
      version: '1.1.0-vps'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default app.listen(PORT, () => {
  logger.info(`🌐 VPS API Dashboard: http://localhost:${PORT}/health`);
  logger.info(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
});

