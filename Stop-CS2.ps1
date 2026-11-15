$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml -f audit-20261112/compose.retrained.yml stop
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose could not stop all services.' }
} finally {
    Pop-Location
}
