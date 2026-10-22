#!/bin/bash
# Run on a fresh Amazon Linux 2023 EC2 instance:
#   bash ec2-setup.sh
set -e

sudo dnf update -y
sudo dnf install -y nginx git nodejs npm

sudo npm install -g pm2

sudo systemctl enable nginx
sudo systemctl start nginx
echo "Base setup done. Next: upload code, create .env, start with PM2."
