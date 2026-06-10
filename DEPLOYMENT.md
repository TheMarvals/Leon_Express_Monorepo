# Leon Express - VPS Deployment Guide

## 🚀 Quick Deployment

### Prerequisites on VPS
```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Option 1: Automated Deployment (Recommended)
```bash
# From your local machine
./deploy_to_vps.sh YOUR_VPS_IP USERNAME
```

### Option 2: Manual Deployment
```bash
# 1. Copy files to VPS
scp docker-compose.yml .env leon_express_*.tar user@vps_ip:/opt/leon_express/
scp -r LeonExpress_back/uploads user@vps_ip:/opt/leon_express/

# 2. SSH to VPS and deploy
ssh user@vps_ip
cd /opt/leon_express

# Load Docker images
docker load -i leon_express_frontend.tar
docker load -i leon_express_backend.tar

# Start services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

## 🔧 Environment Configuration

### Required .env variables:
```bash
# Database (use your existing remote DB or set up new one)
DB_HOST=your_database_host
DB_PORT=3306
DB_NAME=leon_express
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT Secret
JWT_SECRET=your_jwt_secret_key

# VAPID Keys for push notifications
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# Frontend API URL (adjust if using different ports/domains)
VITE_API_BASE_URL=http://your_vps_ip:4000/api
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

## 🌐 Access Points
- **Frontend**: http://your_vps_ip (port 80)
- **Backend API**: http://your_vps_ip:4000
- **Admin Dashboard**: http://your_vps_ip/admin

## 📋 Management Commands

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f [service_name]

# Restart services
docker-compose restart

# Update deployment
docker-compose pull && docker-compose up -d

# Stop services
docker-compose down

# Backup uploads
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz uploads/
```

## 🔒 Security Recommendations

1. **Firewall Setup**:
   ```bash
   sudo ufw allow 22    # SSH
   sudo ufw allow 80    # HTTP
   sudo ufw allow 443   # HTTPS (if using SSL)
   sudo ufw allow 4000  # Backend API
   sudo ufw enable
   ```

2. **SSL Certificate** (Optional but recommended):
   ```bash
   # Install Certbot
   sudo apt install certbot
   
   # Get certificate (stop nginx first)
   sudo docker-compose down
   sudo certbot certonly --standalone -d your-domain.com
   
   # Update nginx config to use SSL
   ```

3. **Regular Backups**:
   - Database backups
   - Uploads directory backup
   - Environment files backup

## 🐛 Troubleshooting

### Container Issues
```bash
# Check container logs
docker-compose logs backend
docker-compose logs frontend

# Restart specific service
docker-compose restart backend

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Issues
- Verify DB_HOST is accessible from VPS
- Check firewall rules on database server
- Test connection: `mysql -h DB_HOST -u DB_USER -p DB_NAME`

### Frontend Not Loading
- Check if port 80 is accessible
- Verify VITE_API_BASE_URL points to correct backend
- Check browser console for errors

## 📞 Support

If you encounter issues:
1. Check container logs: `docker-compose logs -f`
2. Verify environment variables in `.env`
3. Check network connectivity between services
4. Ensure all required ports are open