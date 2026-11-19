# ==============================================================================
# ShopRight - One-Click Full Stack Launcher
# ==============================================================================
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " 🚀 Starting ShopRight Hyperlocal Marketplace Platform..." -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green

# 1. Clean up stale ports
Write-Host "`n[1/4] Ensuring ports are free..." -ForegroundColor Yellow
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001,5173,5174,5175,5176,5555 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

# 2. Start PostgreSQL Docker container
Write-Host "[2/4] Starting PostgreSQL 16 (Docker)..." -ForegroundColor Yellow
docker compose up -d

# 3. Build shared types
Write-Host "[3/4] Building shared-types..." -ForegroundColor Yellow
npm run build --workspace=packages/shared-types

# 4. Launch all 6 services concurrently
Write-Host "[4/4] Launching all services concurrently..." -ForegroundColor Green
Write-Host ""
Write-Host " 🌐 Service Directory:" -ForegroundColor Cyan
Write-Host "    - Customer App:   http://localhost:5173" -ForegroundColor White
Write-Host "    - Merchant App:   http://localhost:5174" -ForegroundColor White
Write-Host "    - Delivery App:   http://localhost:5175" -ForegroundColor White
Write-Host "    - Admin App:      http://localhost:5176" -ForegroundColor White
Write-Host "    - API Gateway:    http://localhost:3001 (Health: /api/v1/health)" -ForegroundColor White
Write-Host "    - Prisma Studio:  http://localhost:5555" -ForegroundColor White
Write-Host "    - Database:       localhost:5432 (PostgreSQL)" -ForegroundColor White
Write-Host ""
Write-Host " Press Ctrl+C in this terminal to shut down all services at once." -ForegroundColor Gray
Write-Host "==============================================================================`n" -ForegroundColor Green

npm run dev
