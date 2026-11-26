# Segunda ronda REAL por el BFF desplegado (BE #25, #29, #33, #37, #115 y sus QA).
# Pide los datos por consola; contrasenas y OTP con entrada oculta. Nada queda en el historial
# ni en variables de entorno al terminar. Requiere la autorizacion de G7 para esta ronda.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$names = 'BFF_MODE', 'BFF_REAL_AUTHORIZED', 'BFF_WEB_ORIGIN', 'BFF_EMAIL', 'BFF_PASSWORD', 'BFF_UNKNOWN_EMAIL',
  'BFF_PHONE', 'BFF_NEW_EMAIL', 'BFF_NEW_PASSWORD', 'BFF_MFA_EMAIL', 'BFF_MFA_PASSWORD'

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host 'Ronda REAL contra https://g1-marketplace-backend.onrender.com (maximo 30 solicitudes, sin carga ni 429).'
Write-Host 'No grabes la pantalla. El informe sanitizado queda en docs/evidencias/H5/integracion-real/bff/ (ignorado por Git).'
if ((Read-Host 'Brenis (G7) autorizo esta ronda por el BFF hoy? Escribe AUTORIZADO') -ne 'AUTORIZADO') {
  Write-Host 'Ronda cancelada: falta la autorizacion de G7.'; exit 1
}
$code = 1
try {
  $env:BFF_MODE = 'real'
  $env:BFF_REAL_AUTHORIZED = '1'
  $origin = (Read-Host 'Origen web exacto de G1_WEB_ORIGIN en Render (Enter = https://g1-marketplace-frontend.vercel.app)').Trim()
  $env:BFF_WEB_ORIGIN = if ($origin) { $origin } else { 'https://g1-marketplace-frontend.vercel.app' }
  $env:BFF_EMAIL = (Read-Host 'Correo de la cuenta CLIENTE sin MFA (+g7e), ACTIVA en G7').Trim()
  $env:BFF_PASSWORD = Read-Secret 'Contrasena de esa cuenta'
  $env:BFF_UNKNOWN_EMAIL = (Read-Host 'Correo NO registrado en G7 para la recuperacion neutra').Trim()
  $env:BFF_PHONE = (Read-Host 'Celular ficticio acordado (+51 y nueve digitos)').Trim()
  $alias = (Read-Host 'Alias nuevo para un registro de prueba (Enter = omitir)').Trim()
  if ($alias) {
    $env:BFF_NEW_EMAIL = $alias
    $env:BFF_NEW_PASSWORD = Read-Secret 'Contrasena para ese alias nuevo (cumple la politica de G7)'
  }
  if ((Read-Host 'Incluir la rama MFA con la cuenta A o B? (S/N)') -match '^[sS]') {
    $env:BFF_MFA_EMAIL = (Read-Host 'Correo de la cuenta con MFA').Trim()
    $env:BFF_MFA_PASSWORD = Read-Secret 'Contrasena de la cuenta con MFA'
    Write-Host 'Cuando el kit lo pida, escribe el OTP de seis digitos que llegue al correo (entrada oculta).'
  }
  node scripts/bff-integration-real.mjs
  $code = $LASTEXITCODE
} finally {
  foreach ($name in $names) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
}
exit $code
