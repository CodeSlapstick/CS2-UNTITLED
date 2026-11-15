[CmdletBinding()]
param([switch]$Build)

$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $buildArgs = @()
    if ($Build) { $buildArgs += '--build' }
    docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml -f audit-20261112/compose.retrained.yml up -d --wait @buildArgs
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose could not start all services.' }
    Write-Host 'CS2 UNTITLED: http://localhost:3000'
} finally {
    Pop-Location
}
