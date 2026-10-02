#!/usr/bin/env bash
set -euo pipefail
cd /opt/milessic-themes
git pull
sudo systemctl restart milessic-themes
echo "Deployed $(git rev-parse --short HEAD)"

