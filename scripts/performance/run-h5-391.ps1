param(
  [Parameter(Mandatory)]
  [string] $OutputDirectory,

  [ValidateSet('warmup', 'load', 'stress')]
  [string] $Profile = 'load',

  [ValidateSet('catalog', 'cart')]
  [string] $Workload = 'catalog'
)

$ErrorActionPreference = 'Stop'
if ($Profile -ne 'load' -and $Workload -ne 'catalog') {
  throw 'Solo el perfil de carga admite el escenario de carrito.'
}

$resultPath = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $resultPath) {
  throw "La carpeta de resultados ya existe: $resultPath"
}

$repository = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')
$compose = @('-f', 'compose.h3.yaml', '-f', 'compose.h5.perf.yaml')
Push-Location -LiteralPath $repository
try {
  $internal = docker network inspect g1-marketplace-h5-perf_default --format '{{.Internal}}'
  if ($LASTEXITCODE -ne 0 -or $internal -ne 'true') {
    throw 'Levanta primero el Compose de performance con su red interna.'
  }

  $backend = docker compose @compose ps -q backend
  $postgres = docker compose @compose ps -q postgres
  if (-not $backend -or -not $postgres) {
    throw 'El BFF y PostgreSQL del Compose de performance deben estar en ejecución.'
  }

  $network = docker inspect $backend --format '{{.HostConfig.NetworkMode}}'
  $published = docker inspect $backend --format '{{json .HostConfig.PortBindings}}'
  if ($network -ne 'g1-marketplace-h5-perf_default' -or $published -notin @('{}', 'null')) {
    throw 'El BFF de performance debe estar en la red interna y sin puertos publicados.'
  }

  $sha = docker inspect $backend --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
  if ($sha -notmatch '^[a-f0-9]{40}$') {
    $sha = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar el SHA.' }
  }
  $cacheTtlMs = docker exec $backend node -p "process.env.CATALOG_CACHE_TTL_MS || '0'"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar el TTL del BFF.' }
  $images = docker inspect $backend $postgres --format '{{.Name}} {{.Image}} cpu={{.HostConfig.NanoCpus}} memory={{.HostConfig.Memory}}'
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron registrar las imágenes y límites.' }
  New-Item -ItemType Directory -Path $resultPath | Out-Null

  $statsPath = Join-Path $resultPath 'docker-stats.jsonl'
  $sampler = Start-Job -ArgumentList $backend, $postgres, $statsPath -ScriptBlock {
    param($bffContainer, $pgContainer, $target)
    while ($true) {
      $when = [DateTime]::UtcNow.ToString('o')
      docker stats --no-stream --format '{{json .}}' $bffContainer $pgContainer |
        ForEach-Object {
          $entry = $_ | ConvertFrom-Json
          [ordered]@{
            sampledAt = $when
            container = $entry.Name
            cpu = $entry.CPUPerc
            memory = $entry.MemUsage
          } | ConvertTo-Json -Compress | Add-Content -LiteralPath $target -Encoding utf8
        }
      Start-Sleep -Seconds 2
    }
  }

  $startedAt = [DateTime]::UtcNow.ToString('o')
  try {
    docker compose @compose run --rm --no-deps -T -v "${resultPath}:/results" `
      -e PERF_MOCK_MODE=true -e PERF_RUN_AUTHORIZED=1 `
      -e "PERF_PROFILE=$Profile" -e "PERF_CASE=$Workload" `
      k6 run --quiet --no-color --summary-export=/results/summary.json /perf/h5-391.js 2>&1 |
      Tee-Object -FilePath (Join-Path $resultPath 'k6.log')
    $runExit = $LASTEXITCODE
  } finally {
    Stop-Job $sampler
    Remove-Job $sampler
  }

  [ordered]@{
    sha = $sha
    profile = $Profile
    workload = $Workload
    startedAt = $startedAt
    finishedAt = [DateTime]::UtcNow.ToString('o')
    k6 = '1.2.3'
    catalogCacheTtlMs = [int]$cacheTtlMs
    origin = 'http://127.0.0.1:10000'
    upstreams = 'G5, G6 and G7 mocked, isolated Docker network'
    containers = @($images)
    exitCode = $runExit
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resultPath 'metadata.json') -Encoding utf8
  exit $runExit
} finally {
  Pop-Location
}
