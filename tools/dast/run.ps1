[CmdletBinding()]
param(
    [string]$AppSource = (Join-Path $PSScriptRoot '../..'),
    [string]$Contract = (Join-Path $PSScriptRoot '../../../../repositories/Modulo-de-Seguridad/specs/openapi.yaml'),
    [string]$FrontendSource,
    [string]$Output = (Join-Path $PSScriptRoot '../../docs/evidencias/H5/dast')
)
$ErrorActionPreference = 'Stop'
$env:DAST_SOURCE = (Resolve-Path -LiteralPath $AppSource).Path
if ($FrontendSource) { $env:DAST_FRONTEND = (Resolve-Path -LiteralPath $FrontendSource).Path }
$env:DAST_CONTRACT = (Resolve-Path -LiteralPath $Contract).Path
$normalized = [IO.File]::ReadAllText($env:DAST_CONTRACT).Replace("`r`n", "`n")
$checksum = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($normalized)))
if ($checksum -ne '61BF8DEB1803B1EB332B55A28B5D73D917654C1229215B2B4EBB51B82796D435') {
    throw 'Usa el contrato G7 1.0.0 fijado en la documentación.'
}
$env:DAST_DB_PASSWORD = [guid]::NewGuid().ToString('N')
$env:DAST_SESSION_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:DAST_RAW = (New-Item -ItemType Directory (Join-Path ([IO.Path]::GetTempPath()) "marketplace-dast-$([guid]::NewGuid())")).FullName
$compose = Join-Path $PSScriptRoot 'compose.yaml'
$project = "marketplace-dast-$([guid]::NewGuid().ToString('N').Substring(0, 10))"

function Invoke-Baseline($target, $service, $source, $reportName, $coverageName) {
    docker compose -p $project -f $compose up --build --wait --wait-timeout 130 $service
    if ($LASTEXITCODE -ne 0) { throw "No arrancó $service en el entorno aislado." }
    $rawName = "$service.raw.json"
    docker compose -p $project -f $compose run --rm --no-deps zap zap-baseline.py -t $target --autooff -P 18090 --hook /home/zap/marketplace-seed.py -T 3 -J $rawName -s
    $zapExit = $LASTEXITCODE
    if ($zapExit -notin 0,1,2) { throw "ZAP $service terminó con error $zapExit." }
    $raw = Get-Content -Raw (Join-Path $env:DAST_RAW $rawName) | ConvertFrom-Json
    $coverage = Get-Content -Raw (Join-Path $env:DAST_RAW $coverageName) | ConvertFrom-Json
    if (@($raw.site).Count -ne 1 -or $raw.site[0].'@name' -ne $target) {
        throw 'El reporte no corresponde exclusivamente al destino esperado.'
    }
    $alerts = @(
        foreach ($alert in $raw.site[0].alerts) {
            [ordered]@{
                id = [int]$alert.pluginid
                rule = $alert.name
                risk = $alert.riskdesc
                count = [int]$alert.count
                routes = @($alert.instances | ForEach-Object { "$($_.method) $(([uri]$_.uri).AbsolutePath)" } | Sort-Object -Unique)
            }
        }
    )
    $result = [ordered]@{
        mode = 'MOCK / aislado / pasivo'
        target = $target
        zapVersion = $raw.'@version'
        zapExit = $zapExit
        appRevision = (git -C $source rev-parse HEAD)
        seedRequests = $coverage
        alerts = $alerts
    }
    if ($service -eq 'backend') {
        $log = docker compose -p $project -f $compose logs --no-color backend 2>&1 | Out-String
        foreach ($marker in 'qa-marker@example.invalid','second-marker@example.invalid','SyntheticQaMarker23!','synthetic-reset-marker') {
            if ($log.Contains($marker)) { throw 'El backend registró un marcador sintético.' }
        }
        $result.contractRevision = '1b8f2e35448075a6c396b70fdd4ec1d5b1aa9201'
        $result.syntheticMarkersAbsentFromBackendLog = $true
    }
    $metadataPath = Join-Path $env:DAST_RAW 'frontend-alert-metadata.json'
    if ($service -eq 'frontend' -and (Test-Path -LiteralPath $metadataPath)) {
        $result.informationalAlertMetadata = @(Get-Content -Raw $metadataPath | ConvertFrom-Json)
    }
    $null = New-Item -Force -ItemType Directory $Output
    $result | ConvertTo-Json -Depth 9 | Set-Content -Encoding utf8 (Join-Path $Output $reportName)
    Write-Host "Reporte $service sanitizado en $Output (ZAP: $zapExit)."
}

try {
    Invoke-Baseline 'http://marketplace:10000' 'backend' $env:DAST_SOURCE 'baseline.json' 'coverage.json'
    if ($FrontendSource) {
        Invoke-Baseline 'http://frontend:3000' 'frontend' $env:DAST_FRONTEND 'frontend-baseline.json' 'frontend-coverage.json'
    }
} finally {
    docker compose -p $project -f $compose down --volumes --remove-orphans
    foreach ($name in 'backend.raw.json','coverage.json','frontend.raw.json','frontend-coverage.json','frontend-alert-metadata.json') {
        $file = Join-Path $env:DAST_RAW $name
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Remove-Item -LiteralPath $env:DAST_RAW -ErrorAction SilentlyContinue
}
