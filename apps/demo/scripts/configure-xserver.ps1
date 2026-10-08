param([string]$OutputDirectory = "$PSScriptRoot/../.deploy-private")
$ErrorActionPreference = 'Stop'
# Run this interactively outside chat. Passwords and private keys are not printed.
$fullDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $fullDirectory | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $fullDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict configuration directory access' }
$configPath = Join-Path $fullDirectory 'xserver.json'
if (Test-Path -LiteralPath $configPath) { throw 'Existing configuration found. Keep its signing key; do not regenerate it.' }
$sshHost = Read-Host 'Xserver SSH host (example: sv12345.xserver.jp)'
$sshUser = Read-Host 'Xserver SSH user (server ID)'
$keyPath = Read-Host 'Absolute path of your SSH private-key file (not its contents)'
$publicDirectory = Read-Host 'Absolute remote document root for schiild.pickleballnavi.jp'
$imageDirectory = Read-Host 'Absolute remote image directory OUTSIDE every public_html directory'
if ($sshHost -notmatch '^[a-zA-Z0-9.-]+$' -or $sshUser -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid SSH host or user' }
if ($publicDirectory -notmatch '^/[a-zA-Z0-9_./-]+$' -or $imageDirectory -notmatch '^/[a-zA-Z0-9_./-]+$' -or $imageDirectory.Contains('public_html') -or $publicDirectory.Contains('..') -or $imageDirectory.Contains('..')) { throw 'Invalid remote directories' }
if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw 'SSH key file not found' }
$keyBytes = [byte[]]::new(32)
[Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
$secret = [Convert]::ToHexString($keyBytes).ToLowerInvariant()
$config = @{ host=$sshHost; user=$sshUser; keyPath=[IO.Path]::GetFullPath($keyPath); port=10022; publicDirectory=$publicDirectory; imageDirectory=$imageDirectory; secret=$secret }
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
$secret | Set-Content -LiteralPath (Join-Path $fullDirectory 'storage-secret.txt') -Encoding ascii -NoNewline
Write-Host 'Private configuration saved. Tell Codex only that configuration is complete.'
