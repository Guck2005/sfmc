# Remet à zéro toutes les BDD + seed démo (données fictives).
# Prérequis : Postgres (docker-compose) démarré.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
node scripts/reset-all-dbs.mjs
