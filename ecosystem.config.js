module.exports = {
  apps: [{
    name: 'whatsapp-moderation',
    script: './index.js',
    instances: 'max',  // Cluster mode - auto CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      UPLOADS_PATH: '/opt/bo/uploads',
      SESSION_PATH: '/opt/bo/sessions',
      OLLAMA_URL: 'http://localhost:11434',
      MISTRAL_MODEL: 'mistral:7b-instruct',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',  // Less verbose in prod
      CLUSTER_MODE: 'true'
    },
    // Auto-restart critical
    max_memory_restart: '500M',
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 5000,
    
    // Logging PM2
    error_file: '/opt/bo/logs/pm2-error.log',
    out_file: '/opt/bo/logs/pm2-out.log',
    log_file: '/opt/bo/logs/pm2-combined.log',
    time: true,
    
    // Watchdog
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads', 'sessions'],
    
    // User VPS (Ubuntu)
    user: 'ubuntu',
    
    // Kill old clusters on deploy
    kill_timeout: 5000
  }]
}

