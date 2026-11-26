# Compra de homologacion por el BFF desplegado: Ventas REAL, cotizacion y revalidacion MOCK (fixture).
# Uso:  pwsh -NoProfile -File scripts\compra-real.ps1 [-HastaPreparacion]
# Pide la contrasena de la cuenta A y el OTP con entrada oculta. Nada queda en variables al terminar.
param([switch]$HastaPreparacion)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$names = 'BUY_MODE', 'BUY_REAL_AUTHORIZED', 'BUY_BFF_SHA', 'BUY_EMAIL', 'BUY_PASSWORD', 'BUY_SKU', 'BUY_UNIT_PRICE_CENTS',
  'BUY_SHIPPING_CENTS', 'BUY_ADDRESS_LABEL', 'BUY_CONTACT_NAME', 'BUY_CONTACT_DOC_TYPE', 'BUY_CONTACT_DOC_NUMBER',
  'BUY_CONTACT_PHONE', 'BUY_CONTACT_EMAIL'

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if ($HastaPreparacion) { Write-Host 'ENSAYO: llega hasta la preparacion (paso 5) y NO crea pedido en Ventas.' }
else { Write-Host 'COMPRA: el paso 6 CREA un pedido REAL en Ventas (pedira escribir CREAR PEDIDO).' }
Write-Host 'No grabes la pantalla. Informe sanitizado en docs/evidencias/H5/integracion-real/compra/ (ignorado por Git).'
if ((Read-Host 'Ventas y G7 autorizaron esta ventana de compra? Escribe AUTORIZADO') -ne 'AUTORIZADO') {
  Write-Host 'Cancelado: falta la autorizacion de Ventas y G7.'; exit 1
}
if ((Read-Host 'Render muestra LIVE el deploy de main con #366 y el fixture de Diego cargado? Escribe LIVE') -ne 'LIVE') {
  Write-Host 'Cancelado: nunca ejecutar si el deploy no esta live.'; exit 1
}
$code = 1
try {
  $env:BUY_MODE = 'real'
  $env:BUY_REAL_AUTHORIZED = '1'
  $env:BUY_BFF_SHA = (Read-Host 'SHA del deploy live en Render (Enter = omitir)').Trim()
  $env:BUY_EMAIL = (Read-Host 'Correo de la cuenta A (G7)').Trim()
  $env:BUY_PASSWORD = Read-Secret 'Contrasena de la cuenta A'
  $env:BUY_SKU = (Read-Host 'SKU aprobado (el del fixture)').Trim()
  $env:BUY_UNIT_PRICE_CENTS = (Read-Host 'Precio unitario esperado en centimos (ej. 12990)').Trim()
  $env:BUY_SHIPPING_CENTS = (Read-Host 'Envio esperado en centimos (ej. 1000)').Trim()
  $env:BUY_ADDRESS_LABEL = (Read-Host 'Etiqueta de la direccion de prueba (Enter = si la cuenta tiene una sola)').Trim()
  if (-not $HastaPreparacion) {
    Write-Host 'Contacto de prueba: valores sinteticos aceptados por Ventas.'
    $env:BUY_CONTACT_NAME = (Read-Host 'Nombre completo').Trim()
    $env:BUY_CONTACT_DOC_TYPE = (Read-Host 'Tipo de documento (DNI, RUC, CE o PASAPORTE)').Trim()
    $env:BUY_CONTACT_DOC_NUMBER = (Read-Host 'Numero de documento').Trim()
    $env:BUY_CONTACT_PHONE = (Read-Host 'Telefono').Trim()
    $env:BUY_CONTACT_EMAIL = (Read-Host 'Correo de contacto').Trim()
  }
  Write-Host 'Cuando lo pida, escribe el OTP de seis digitos que llegue al correo de la cuenta A (entrada oculta).'
  if ($HastaPreparacion) { node scripts/compra-real.mjs --hasta-preparacion } else { node scripts/compra-real.mjs }
  $code = $LASTEXITCODE
} finally {
  foreach ($name in $names) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
}
exit $code
