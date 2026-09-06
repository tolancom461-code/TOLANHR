param(
  [string]$TargetUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MainEnv = Join-Path $Root ".env"
$BiometricEnv = Join-Path $Root "biometric-service\.env"

if (-not (Test-Path $MainEnv)) { throw "Main app .env was not found: $MainEnv" }
if (-not (Test-Path $BiometricEnv)) { throw "biometric-service .env was not found: $BiometricEnv" }

function Set-DotEnvValue {
  param([string]$Path, [string]$Key, [string]$Value)
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) { [void]$lines.Add($line) }
  $pattern = '^' + [Regex]::Escape($Key) + '='
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $pattern) {
      $lines[$i] = "$Key=$Value"
      $found = $true
    }
  }
  if (-not $found) { [void]$lines.Add("$Key=$Value") }
  [System.IO.File]::WriteAllLines($Path, $lines, [System.Text.UTF8Encoding]::new($false))
}

$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
}
finally {
  $rng.Dispose()
}
$token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')

Set-DotEnvValue -Path $MainEnv -Key "BIOMETRIC_WEB_BRIDGE_INGEST_TOKEN" -Value $token
# The local test should exercise the same outbound-push architecture intended for Railway.
Set-DotEnvValue -Path $MainEnv -Key "BIOMETRIC_FINAL_EVENTS_IMPORT_ENABLED" -Value "false"

Set-DotEnvValue -Path $BiometricEnv -Key "BIOMETRIC_WEB_BRIDGE_ENABLED" -Value "true"
Set-DotEnvValue -Path $BiometricEnv -Key "BIOMETRIC_WEB_BRIDGE_TARGET_URL" -Value $TargetUrl
Set-DotEnvValue -Path $BiometricEnv -Key "BIOMETRIC_WEB_BRIDGE_TOKEN" -Value $token
Set-DotEnvValue -Path $BiometricEnv -Key "BIOMETRIC_WEB_BRIDGE_INTERVAL_SECONDS" -Value "10"
Set-DotEnvValue -Path $BiometricEnv -Key "BIOMETRIC_WEB_BRIDGE_REQUEST_TIMEOUT_SECONDS" -Value "10"

Write-Host "Local biometric web bridge configuration saved."
Write-Host "The bridge token was generated locally and was not displayed."
Write-Host "Main-app pull importer was disabled so the local test uses outbound push only."
