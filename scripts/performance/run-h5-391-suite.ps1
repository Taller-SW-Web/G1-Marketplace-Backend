param(
  [Parameter(Mandatory)]
  [string] $OutputDirectory,

  [switch] $SmokeOnly
)

$ErrorActionPreference = 'Stop'
$resultRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $resultRoot) {
  throw "La carpeta de resultados ya existe: $resultRoot"
}

$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$compose = @('-f', 'compose.h3.yaml', '-f', 'compose.h5.perf.yaml')
$runner = Join-Path $PSScriptRoot 'run-h5-391.ps1'
$engine = (Get-Process -Id $PID).Path
$baseline = '64670d358fab0c8349ba92de853536f373d5c94a'
$candidate = '025efef0a4f6aa234fa51f8ba0986c9812ade870'
$baselineImage = 'g1-marketplace-h5-perf-bff:64670d3'
$candidateImage = 'g1-marketplace-h5-cache-345:025efef'

function Use-SourceImage([string] $Revision, [string] $Image, [string] $Name) {
  $existing = docker image inspect $Image --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>$null
  if ($LASTEXITCODE -eq 0 -and $existing -eq $Revision) { return }

  git cat-file -e "${Revision}^{commit}" 2>$null
  if ($LASTEXITCODE -ne 0) {
    git fetch --no-tags origin $Revision
    if ($LASTEXITCODE -ne 0) { throw "No se pudo obtener el SHA $Revision." }
  }
  $source = Join-Path $resultRoot "sources/$Name"
  git worktree add --detach $source $Revision
  if ($LASTEXITCODE -ne 0) { throw "No se pudo preparar el checkout $Revision." }
  docker build --tag $Image --label "org.opencontainers.image.revision=$Revision" $source
  if ($LASTEXITCODE -ne 0) { throw "No se pudo construir $Image." }
}

function Start-Fixtures([string] $Image, [int] $Ttl, [int] $Latency) {
  $env:PERF_BACKEND_IMAGE = $Image
  $env:PERF_CATALOG_CACHE_TTL_MS = [string]$Ttl
  $env:PERF_G5_LATENCY_MS = [string]$Latency
  $env:PERF_G6_LATENCY_MS = [string]$Latency
  docker compose @compose up -d --no-build --force-recreate --wait --wait-timeout 90 postgres backend
  if ($LASTEXITCODE -ne 0) {
    docker compose @compose logs --tail 35 backend
    throw 'No arrancaron los servicios aislados.'
  }
}

function Invoke-Profile([string] $Name, [string] $Profile, [string] $Workload = 'catalog', [int] $MaxVus = 400) {
  $output = Join-Path $resultRoot $Name
  & $engine -NoProfile -File $runner -Profile $Profile -Workload $Workload -MaxStressVus $MaxVus -OutputDirectory $output
  $profileExit = $LASTEXITCODE
  if ($profileExit -notin @(0, 99) -or -not (Test-Path -LiteralPath (Join-Path $output 'summary.json'))) {
    throw "La corrida $Name no produjo resultados válidos. Código $profileExit."
  }
  if ($profileExit -eq 99) { Write-Output "K6 detectó un umbral incumplido en $Name. El resultado quedó registrado." }
}

$responseProbe = @'
const { createHash } = require('node:crypto');
(async () => {
  const started = performance.now();
  const response = await fetch('http://127.0.0.1:10000/api/v1/catalog/home');
  const body = await response.text();
  const cacheControl = response.headers.get('cache-control');
  if (!response.ok || cacheControl !== 'no-store') throw new Error('Unexpected catalog contract');
  console.log(JSON.stringify({ http: response.status, cacheControl, elapsedMs: performance.now() - started,
    bytes: Buffer.byteLength(body), bodySha256: createHash('sha256').update(body).digest('hex') }));
})().catch(error => { console.error(error.message); process.exit(1); });
'@

Push-Location -LiteralPath $repository
try {
  New-Item -ItemType Directory -Path (Join-Path $resultRoot 'sources') | Out-Null
  docker compose @compose pull k6 postgres
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron obtener las imágenes de k6 y PostgreSQL.' }
  if ($SmokeOnly) {
    $baseline = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo determinar el SHA para el smoke.' }
    $baselineImage = 'g1-marketplace-h5-perf-smoke:' + $baseline.Substring(0, 12)
  }
  Use-SourceImage $baseline $baselineImage 'baseline'
  Start-Fixtures $baselineImage 0 0
  Invoke-Profile 'smoke' 'smoke'
  if ($SmokeOnly) {
    $status = Get-Content -LiteralPath (Join-Path $resultRoot 'smoke/metadata.json') -Raw | ConvertFrom-Json
    if ($status.exitCode -ne 0) { throw 'El smoke no pasó.' }
  } else {
    Invoke-Profile 'baseline-warmup' 'warmup'
    Invoke-Profile 'baseline-catalog-load' 'load'
    Invoke-Profile 'baseline-cart-load' 'load' 'cart'
    foreach ($limit in 400, 800, 1000) {
      Invoke-Profile "stress-$limit" 'stress' 'catalog' $limit
      $summaryPath = Join-Path $resultRoot "stress-$limit/summary.json"
      $metrics = (Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json -AsHashtable).metrics
      $breach = @(20, 50, 100, 200, 400, 800, 1000 | Where-Object {
        $_ -le $limit -and ($metrics["http_req_duration{phase:vu$_}"]['p(95)'] -gt 500 -or
          $metrics["http_req_failed{phase:vu$_}"].value -gt 0.01)
      })
      if ($breach.Count) { break }
    }
    Invoke-Profile 'spike' 'spike'

    Use-SourceImage $candidate $candidateImage 'cache-candidate'
    foreach ($condition in @(@{ name = 'cache-off'; ttl = 0 }, @{ name = 'cache-on'; ttl = 120000 })) {
      Start-Fixtures $candidateImage $condition.ttl 120
      docker compose @compose exec -T backend node -e $responseProbe |
        Set-Content -LiteralPath (Join-Path $resultRoot "$($condition.name)-response.json") -Encoding utf8
      if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el contenido del catálogo.' }
      Invoke-Profile "$($condition.name)-warmup" 'warmup'
      Invoke-Profile "$($condition.name)-catalog-load" 'load'
      Invoke-Profile "$($condition.name)-cart-load" 'load' 'cart'
    }
    Invoke-Profile 'soak' 'soak'
    node (Join-Path $PSScriptRoot 'report-h5-391.mjs') $resultRoot
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el reporte consolidado.' }
  }
} finally {
  docker compose @compose down
  Pop-Location
}
