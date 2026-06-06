# Tino 2 - Deployment & Setup Guide

## Table of Contents
- [Prerequisites](#prerequisites)
- [Development Environment Setup](#development-environment-setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **Node.js**: Version 18+ (LTS recommended)
- **npm**: Version 8+ (comes with Node.js)
- **Git**: For version control
- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+)

### Development Tools (Recommended)
- **Code Editor**: VS Code with extensions:
  - ES7+ React/Redux/React-Native snippets
  - TypeScript and JavaScript Language Features
  - Prettier - Code formatter
  - ESLint
- **Database Tools**: 
  - Adminer (bundled in docker-compose, port 8080) or pgAdmin (PostgreSQL)
- **API Testing**: Postman or Insomnia
- **Version Control**: Git with GitHub/GitLab

## Development Environment Setup

### 1. Clone the Repository
```bash
# Clone the repository
git clone https://github.com/your-org/tino-2.git
cd tino-2

# Or if renaming from existing repo
git clone https://github.com/dymowb/tino2.git tino-2
cd tino-2
```

### 2. Install Dependencies

#### Backend Dependencies
```bash
cd backend
npm install
```

**Key Backend Dependencies:**
```json
{
  "express": "^5.1.0",
  "socket.io": "^4.8.1", 
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^3.0.2",
  "pg": "^8.16.3",
  "redis": "^5.5.6",
  "mongoose": "^8.16.1"
}
```

#### Frontend Dependencies  
```bash
cd frontend
npm install
```

**Key Frontend Dependencies:**
```json
{
  "react": "^19.1.0",
  "typescript": "^4.9.5",
  "@tanstack/react-query": "^5.81.5",
  "axios": "^1.10.0",
  "react-router-dom": "^7.6.3",
  "socket.io-client": "^4.8.1"
}
```

### 3. Verify Installation
```bash
# Check Node.js version
node --version  # Should be 18+

# Check npm version  
npm --version   # Should be 8+

# Verify dependencies installed
cd backend && npm list --depth=0
cd frontend && npm list --depth=0
```

## Environment Configuration

### Backend Environment Variables
Create `.env` file in the `backend` directory:

```bash
# Copy example environment file
cd backend
cp .env.example .env
```

**Backend .env Configuration:**
```env
# Server Configuration
NODE_ENV=development
PORT=5000
HOST=localhost

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=1h

# Database Configuration (PostgreSQL everywhere — dev via Docker, see docker-compose.yml)
DATABASE_URL=postgresql://tino:tino@localhost:5432/tino_app
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=tino2_db  
# DB_USER=tino2_user
# DB_PASSWORD=secure_password

# Redis Configuration (comment out for development)
# REDIS_URL=redis://localhost:6379
# REDIS_PASSWORD=

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/tino2_messages
MONGODB_TEST_URI=mongodb://localhost:27017/tino2_messages_test

# File Upload Configuration
UPLOAD_PATH=uploads
MAX_FILE_SIZE=5242880

# External API Keys (add when implementing)
# GOOGLE_MAPS_API_KEY=your_google_maps_key
# STRIPE_SECRET_KEY=your_stripe_secret_key
# STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
# SENDGRID_API_KEY=your_sendgrid_key
# TWILIO_ACCOUNT_SID=your_twilio_sid
# TWILIO_AUTH_TOKEN=your_twilio_token

# Security Configuration
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=debug
```

### Frontend Environment Variables
Create `.env` file in the `frontend` directory:

```bash
# Copy or create frontend .env file
cd frontend
```

**Frontend .env Configuration:**
```env
# API Configuration
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000

# External Services (add when implementing)
# REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
# REACT_APP_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# Development Settings
REACT_APP_ENV=development
GENERATE_SOURCEMAP=true
```

### Security Notes
⚠️ **Important Security Reminders:**
- Never commit `.env` files to version control
- Use strong, unique JWT secrets in production
- Rotate secrets regularly
- Use environment-specific configurations
- Enable HTTPS in production

## Database Setup

### Development Database (PostgreSQL via Docker)
The application uses PostgreSQL in all environments. For local dev, start the bundled container:

```bash
docker compose up -d postgres-app   # container: tino2-app-db, port 5432
cd backend
npm run dev
```

**Connection (default dev):** `postgresql://tino:tino@localhost:5432/tino_app`
Inspect with: `docker exec tino2-app-db psql -U tino -d tino_app`

### Database Schema Creation
The database schema is created automatically when the application starts. For manual schema setup:

```bash
# Run database migrations (if implemented)
cd backend  
npm run migrate

# Seed development data
npm run seed
```

### Production Database (PostgreSQL)

#### Install PostgreSQL
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS with Homebrew
brew install postgresql
brew services start postgresql

# Windows - Download installer from postgresql.org
```

#### Create Database and User
```sql
-- Connect to PostgreSQL as superuser
sudo -u postgres psql

-- Create database
CREATE DATABASE tino2_db;

-- Create user
CREATE USER tino2_user WITH PASSWORD 'secure_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE tino2_db TO tino2_user;

-- Exit
\q
```

#### Update Environment Variables
```env
# Update backend/.env for production
DB_TYPE=postgresql
DATABASE_URL=postgresql://tino2_user:secure_password@localhost:5432/tino2_db
```

### Redis Setup (Optional - for production caching)

#### Install Redis
```bash
# Ubuntu/Debian
sudo apt install redis-server

# macOS with Homebrew  
brew install redis
brew services start redis

# Verify installation
redis-cli ping  # Should return PONG
```

### MongoDB Setup (for messaging)

#### Install MongoDB
```bash
# Ubuntu/Debian
sudo apt install mongodb

# macOS with Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Verify installation
mongosh  # Should connect to MongoDB shell
```

## Running the Application

### Development Mode

#### Start Backend Server
```bash
cd backend
npm run dev
```

**Expected Output:**
```
> backend@1.0.0 dev
> nodemon src/server.js

[nodemon] starting `node src/server.js`
Server running on http://localhost:5000
Database connected: PostgreSQL tino_app
Socket.IO server initialized
```

#### Start Frontend Server
```bash
# Open new terminal
cd frontend  
npm start
```

**Expected Output:**
```
> frontend@0.1.0 start
> react-scripts start

Starting the development server...
Compiled successfully!

Local:            http://localhost:3000
On Your Network:  http://192.168.1.100:3000
```

#### Verify Application
1. **Frontend**: Open http://localhost:3000
2. **Backend API**: Open http://localhost:5000/api/health (if health endpoint exists)
3. **Database**: Check `backend/data/development.db` exists

### Production Mode

#### Build Frontend
```bash
cd frontend
npm run build
```

#### Start Backend (Production)
```bash
cd backend
NODE_ENV=production npm start
```

### Testing

#### Run Backend Tests
```bash
cd backend
npm test
```

#### Run Frontend Tests  
```bash
cd frontend
npm test
```

#### Run All Tests
```bash
# From project root
npm run test:all  # If script exists
```

## Production Deployment

### Server Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB+ (8GB recommended)
- **Storage**: 50GB+ SSD
- **Network**: 1Gbps connection
- **OS**: Ubuntu 20.04 LTS or similar

### Server Setup

#### 1. Update System
```bash
sudo apt update && sudo apt upgrade -y
```

#### 2. Install Node.js
```bash
# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

#### 3. Install Process Manager
```bash
# Install PM2 for process management
sudo npm install -g pm2
```

#### 4. Install Nginx
```bash
sudo apt install nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

#### 5. Install SSL Certificate
```bash
# Install Certbot for Let's Encrypt SSL
sudo apt install certbot python3-certbot-nginx

# Generate SSL certificate
sudo certbot --nginx -d your-domain.com -d api.your-domain.com
```

### Application Deployment

#### 1. Clone and Setup Application
```bash
# Clone repository to server
git clone https://github.com/your-org/tino-2.git /var/www/tino2
cd /var/www/tino2

# Install dependencies
cd backend && npm ci --production
cd frontend && npm ci --production

# Build frontend
cd frontend && npm run build
```

#### 2. Configure Environment
```bash
# Create production environment file
cd backend
cp .env.example .env.production
# Edit .env.production with production values
```

#### 3. Configure PM2
Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'tino2-api',
    script: 'backend/src/server.js',
    cwd: '/var/www/tino2',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    error_file: '/var/log/tino2/api-error.log',
    out_file: '/var/log/tino2/api-out.log',
    log_file: '/var/log/tino2/api-combined.log'
  }]
};
```

#### 4. Start Application
```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

#### 5. Configure Nginx
Create `/etc/nginx/sites-available/tino2`:

```nginx
# Frontend (React app)
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # Frontend static files
    root /var/www/tino2/frontend/build;
    index index.html;
    
    # Handle React routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Static assets caching
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Backend API
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.your-domain.com;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # API proxy
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/tino2 /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Docker Deployment

### Docker Configuration

#### Create Dockerfile for Backend
Create `backend/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Start application
CMD ["npm", "start"]
```

#### Create Dockerfile for Frontend
Create `frontend/Dockerfile`:

```dockerfile
# Multi-stage build
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built application
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### Create docker-compose.yml
```yaml
version: '3.8'

services:
  # Frontend
  frontend:
    build: 
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    environment:
      - REACT_APP_API_BASE_URL=http://backend:5000/api

  # Backend  
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    depends_on:
      - postgres
      - redis
      - mongo
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://tino2:password@postgres:5432/tino2
      - REDIS_URL=redis://redis:6379
      - MONGODB_URI=mongodb://mongo:27017/tino2_messages
    volumes:
      - uploads:/app/uploads

  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=tino2
      - POSTGRES_USER=tino2
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Redis Cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # MongoDB
  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  postgres_data:
  redis_data:
  mongo_data:
  uploads:
```

### Deploy with Docker

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Scale backend service
docker-compose up -d --scale backend=3

# Stop services
docker-compose down
```

## Monitoring and Maintenance

### Application Monitoring

#### PM2 Monitoring
```bash
# View application status
pm2 status

# View logs
pm2 logs

# Restart application
pm2 restart tino2-api

# Monitor in real-time
pm2 monit
```

#### System Monitoring
```bash
# System resources
htop

# Disk usage
df -h

# Application logs
tail -f /var/log/tino2/api-combined.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Database Maintenance

#### PostgreSQL Maintenance
```bash
# Database backup
pg_dump -U tino2_user -h localhost tino2_db > backup.sql

# Restore database
psql -U tino2_user -h localhost -d tino2_db < backup.sql

# Vacuum database (optimize performance)
sudo -u postgres psql -d tino2_db -c "VACUUM ANALYZE;"
```

#### MongoDB Maintenance
```bash
# Create backup
mongodump --db tino2_messages --out /backup/mongodb/

# Restore backup
mongorestore --db tino2_messages /backup/mongodb/tino2_messages/
```

### SSL Certificate Renewal
```bash
# Renew Let's Encrypt certificates
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# Automate renewal (add to crontab)
sudo crontab -e
# Add: 0 2 * * * certbot renew --quiet && systemctl reload nginx
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
sudo lsof -i :5000

# Kill process
sudo kill -9 <PID>
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check MongoDB status
sudo systemctl status mongod

# Check Redis status
sudo systemctl status redis
```

#### Application Crashes
```bash
# View PM2 logs
pm2 logs tino2-api --lines 100

# Restart application
pm2 restart tino2-api

# View system logs
sudo journalctl -u nginx -f
```

#### High Memory Usage
```bash
# Check memory usage
free -h

# View process memory usage
ps aux --sort=-%mem | head

# Clear cache
sudo sync && sudo sysctl vm.drop_caches=3
```

### Performance Optimization

#### Backend Optimization
- Enable gzip compression
- Implement Redis caching
- Optimize database queries
- Use connection pooling
- Enable cluster mode

#### Frontend Optimization
- Enable build optimization
- Implement lazy loading
- Use CDN for static assets
- Enable service workers
- Optimize images

#### Database Optimization
- Create proper indexes
- Regular VACUUM and ANALYZE
- Monitor query performance
- Implement read replicas
- Use connection pooling

### Backup Strategy

#### Automated Backup Script
Create `/opt/tino2/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/backup/tino2"
DATE=$(date +"%Y%m%d_%H%M%S")

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
pg_dump -U tino2_user -h localhost tino2_db > $BACKUP_DIR/postgres_$DATE.sql

# Backup MongoDB  
mongodump --db tino2_messages --out $BACKUP_DIR/mongodb_$DATE/

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/tino2/backend/uploads/

# Clean old backups (keep 7 days)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "mongodb_*" -mtime +7 -exec rm -rf {} \;
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make executable and schedule:
```bash
chmod +x /opt/tino2/backup.sh

# Add to crontab for daily backups at 2 AM
sudo crontab -e
# Add: 0 2 * * * /opt/tino2/backup.sh >> /var/log/tino2/backup.log 2>&1
```

---

*This deployment guide provides comprehensive instructions for setting up Tino 2 in both development and production environments. Follow security best practices and monitor system performance regularly.*