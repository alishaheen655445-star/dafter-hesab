# ===========================================================================
#  load-db.ps1 — creates the DB and loads schema.sql + seed.sql.
#  Uses MySQL client from XAMPP (adjust $mysqlExe if your path differs).
# ===========================================================================
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$root      = Split-Path -Parent $PSScriptRoot
$schema    = Join-Path $root 'database\schema.sql'
$seed      = Join-Path $root 'database\seed.sql'
$mysqlExe  = 'C:\xampp\mysql\bin\mysql.exe'

if (-not (Test-Path $mysqlExe)) {
  Write-Host "mysql.exe not found at $mysqlExe" -ForegroundColor Red
  Write-Host "Edit this script and set `$mysqlExe to your MySQL client path." -ForegroundColor Yellow
  exit 1
}

$dbName = 'daftar_hesab_app'

Write-Host "Creating database $dbName ..." -ForegroundColor Cyan
& $mysqlExe -u root -e "CREATE DATABASE IF NOT EXISTS $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

Write-Host "Loading schema.sql ..." -ForegroundColor Cyan
Get-Content $schema -Raw -Encoding UTF8 | & $mysqlExe -u root --default-character-set=utf8mb4 $dbName

if (Test-Path $seed) {
  Write-Host "Loading seed.sql ..." -ForegroundColor Cyan
  Get-Content $seed -Raw -Encoding UTF8 | & $mysqlExe -u root --default-character-set=utf8mb4 $dbName
}

Write-Host "Done." -ForegroundColor Green
