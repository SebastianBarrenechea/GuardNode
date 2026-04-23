# WhatsApp Moderation Bot 🚫🤖

Silent AI-powered WhatsApp group moderation bot. Analyzes content with Mistral 7B, auto-bans violators, zero false positives, admin dashboard.

## ✨ Features
- ✅ Baileys WhatsApp connection (QR auth)
- ✅ Multi-group support
- ✅ Text + Media analysis (FTP storage)
- ✅ Mistral 7B AI moderation
- ✅ Advanced anti-false positive system
- ✅ MariaDB persistence
- ✅ Admin dashboard with unbanning
- ✅ Silent operation (no bot messages)

## 🐧 Ubuntu Installation

```bash
# Prerequisites
sudo apt update &amp;&amp; sudo apt upgrade -y
sudo apt install nodejs npm mariadb-server curl -y

# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone project
git clone YOUR_REPO_URL whatsapp-moderation-bot
cd whatsapp-moderation-bot
npm install

# Database setup
sudo mysql_secure_installation
sudo mysql -u root
# In MySQL:
CREATE DATABASE whatsapp_moderation;
CREATE USER 'moderation_bot'@'localhost' IDENTIFIED BY 'securepass123';
GRANT ALL ON whatsapp_moderation.* TO 'moderation_bot'@'localhost';
FLUSH PRIVILEGES;
exit;

# Ollama + Mistral
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &amp;&amp;
ollama pull mistral:7b

# Configure
cp .env.example .env
nano .env  # Edit FTP, DB, etc.

# Migrate DB
npm run db:migrate

# Run bot
npm start

# Dashboard (separate terminal)
cd dashboard &amp;&amp; npm install &amp;&amp; npm run dev
```

## 📊 Dashboard
- http://localhost:3000
- admin / admin123

## 🛡️ Anti-False Positives
- Confidence ≥75%
- Double detection required
- 3-strike system (7-day window)
- Admin whitelist
- Context analysis (last 3 msgs)
- Rate limited

## 📁 Project Structure
```
├── bot/                 # WhatsApp connection
├── moderation/          # AI analysis
├── ftp/                 # Media upload
├── database/            # MariaDB
├── api/                 # Backend API
├── dashboard/           # Admin panel
└── utils/              # Helpers
```

## 🔧 Development
```bash
npm run dev      # Hot reload
npm run db:migrate  # DB setup
```

Built with ❤️ for moderation WhatsApp groups.

