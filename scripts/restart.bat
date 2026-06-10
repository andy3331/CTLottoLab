@echo off
cd /d "%~dp0.."
docker compose down
docker compose up -d
