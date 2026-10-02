# Genera deploy-lambda.zip listo para subir a AWS Lambda (eventos-core-api-sbx).
# Requisitos: Node.js + npm en PATH. Ejecutar desde esta carpeta:
#   .\build-lambda-zip.ps1
#
# No incluye .env (configura variables en la consola de Lambda).
# Handler típico: index.handler  o  index.handler según index.mjs (Runtime Node.js 18+).

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
Set-Location $Root

Write-Host '>> npm ci --omit=dev' -ForegroundColor Cyan
npm ci --omit=dev

$outZip = Join-Path $Root 'deploy-lambda.zip'
if (Test-Path $outZip) { Remove-Item $outZip -Force }

$items = @(
    'index.mjs',
    'index.js',
    'server.js',
    'package.json',
    'package-lock.json',
    'src',
    'node_modules'
)

foreach ($name in $items) {
    $p = Join-Path $Root $name
    if (-not (Test-Path $p)) {
        throw "Falta: $name"
    }
}

# tar suele manejar mejor rutas largas en node_modules que Compress-Archive
$tar = Get-Command tar -ErrorAction SilentlyContinue
if ($tar) {
    Write-Host '>> tar (zip)' -ForegroundColor Cyan
    Push-Location $Root
    try {
        # -a = deduce formato por extensión .zip; rutas relativas al directorio del proyecto
        & tar.exe -a -cf $outZip @items
    } finally {
        Pop-Location
    }
} else {
    Write-Host '>> Compress-Archive (si falla por rutas largas, instala Git o usa WSL y tar)' -ForegroundColor Yellow
    Compress-Archive -Path ($items | ForEach-Object { Join-Path $Root $_ }) -DestinationPath $outZip -Force
}

$size = (Get-Item $outZip).Length / 1MB
Write-Host ">> Listo: $outZip ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
