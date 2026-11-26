param(
  [Parameter(Mandatory)]
  [string] $OutputDirectory,

  [ValidateSet('warmup', 'load', 'stress', 'spike', 'soak', 'smoke')]
  [string] $Profile = 'load',

  [ValidateSet('catalog', 'cart')]
  [string] $Workload = 'catalog',

  [ValidateSet('200', '400', '800', '1000')]
  [int] $MaxStressVus = 400
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

  foreach ($service in $backend, $postgres) {
    $networks = docker inspect $service --format '{{json .NetworkSettings.Networks}}' | ConvertFrom-Json -AsHashtable
    $published = docker inspect $service --format '{{json .HostConfig.PortBindings}}'
    if ($networks.Count -ne 1 -or -not $networks.Contains('g1-marketplace-h5-perf_default') -or
        $published -notin @('{}', 'null')) {
      throw 'Los servicios de performance deben quedar en una única red interna y sin puertos publicados.'
    }
  }

  $sha = docker inspect $backend --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
  if ($sha -notmatch '^[a-f0-9]{40}$') {
    $sha = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar el SHA.' }
  }
  $configuration = docker exec $backend node -p "JSON.stringify({ttl: +(process.env.CATALOG_CACHE_TTL_MS || 0), g6: +(process.env.PERF_G6_LATENCY_MS || 0), g5: +(process.env.PERF_G5_LATENCY_MS || 0)})" |
    ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar la configuración medida.' }
  $images = docker inspect $backend $postgres --format '{{.Name}} {{.Image}} cpu={{.HostConfig.NanoCpus}} memory={{.HostConfig.Memory}}'
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron registrar las imágenes y límites.' }
  New-Item -ItemType Directory -Path $resultPath | Out-Null

  $statsPath = Join-Path $resultPath 'docker-stats.jsonl'
  $loadContainer = "h5-391-k6-$PID"
  $sampler = Start-Job -ArgumentList $backend, $postgres, $loadContainer, $statsPath -ScriptBlock {
    param($bffContainer, $pgContainer, $load, $target)
    while ($true) {
      $when = [DateTime]::UtcNow.ToString('o')
      $containers = @($bffContainer, $pgContainer)
      if ((docker inspect $load --format '{{.State.Running}}' 2>$null) -eq 'true') {
        $containers += $load
      }
      docker stats --no-stream --format '{{json .}}' @containers 2>$null |
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
    docker compose @compose run --rm --no-deps -T --name $loadContainer -v "${resultPath}:/results" `
      -e PERF_MOCK_MODE=true -e PERF_RUN_AUTHORIZED=1 `
      -e "PERF_PROFILE=$Profile" -e "PERF_CASE=$Workload" `
      -e "PERF_STRESS_MAX_VUS=$MaxStressVus" `
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
    catalogCacheTtlMs = $configuration.ttl
    stubLatencyMs = @{ g5 = $configuration.g5; g6 = $configuration.g6 }
    maxStressVus = if ($Profile -eq 'stress') { $MaxStressVus } else { $null }
    origin = 'http://127.0.0.1:10000'
    upstreams = 'G5, G6 and G7 mocked, isolated Docker network'
    containers = @($images)
    exitCode = $runExit
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resultPath 'metadata.json') -Encoding utf8
  exit $runExit
} finally {
  Pop-Location
}
