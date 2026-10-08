param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$demoRoot = [IO.Path]::GetFullPath("$PSScriptRoot/..")
$privateDirectory = Join-Path $demoRoot '.deploy-private'
$config = Get-Content -LiteralPath (Join-Path $privateDirectory 'xserver.json') -Raw | ConvertFrom-Json
if ($config.host -notmatch '^[a-zA-Z0-9.-]+$' -or $config.user -notmatch '^[a-zA-Z0-9_-]+$' -or $config.secret -notmatch '^[a-f0-9]{64}$') { throw 'Invalid configuration' }
foreach ($directory in @($config.publicDirectory,$config.imageDirectory)) {
 if ($directory -notmatch '^/[a-zA-Z0-9_./-]+$' -or $directory.Contains('..')) { throw 'Invalid remote directory' }
}
if ($config.imageDirectory.Contains('public_html')) { throw 'Images must stay outside public_html' }
$connection = "$($config.user)@$($config.host)"
$sshArgs = @('-p', [string]$config.port, '-i', $config.keyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
if ($config.knownHostsPath) { $sshArgs += @('-o', "UserKnownHostsFile=$($config.knownHostsPath)") }
& ssh @sshArgs $connection "test -d '$($config.publicDirectory)' && printf 'SSH ready'"
if ($LASTEXITCODE -ne 0) { throw 'SSH connection failed. Establish host trust and unlock your key interactively outside chat first.' }
if ($CheckOnly) { exit }
$bundle = Join-Path $demoRoot '.wrangler/xserver-site'
if (-not (Test-Path -LiteralPath (Join-Path $bundle 'deployment.json'))) { throw 'Build the Xserver bundle first' }
$phpConfig = "<?php return ['secret'=>'$($config.secret)','directory'=>'$($config.imageDirectory)'];"
$phpConfig | Set-Content -LiteralPath (Join-Path $privateDirectory '.storage-config.php') -Encoding ascii -NoNewline
$archive = Join-Path $privateDirectory 'ui-storage.tar.gz'
& tar -czf $archive -C $bundle .
if ($LASTEXITCODE -ne 0) { throw 'Archive failed' }
& ssh @sshArgs $connection "umask 077; mkdir -p '$($config.imageDirectory)'"
if ($LASTEXITCODE -ne 0) { throw 'Image directory preparation failed' }
$scpArgs = @('-P', [string]$config.port, '-i', $config.keyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
if ($config.knownHostsPath) { $scpArgs += @('-o', "UserKnownHostsFile=$($config.knownHostsPath)") }
& scp @scpArgs $archive "${connection}:$($config.imageDirectory)/ui-storage.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'UI upload failed' }
& scp @scpArgs (Join-Path $privateDirectory '.storage-config.php') "${connection}:$($config.publicDirectory)/.storage-config.php"
if ($LASTEXITCODE -ne 0) { throw 'Storage configuration upload failed' }
# No recursive delete and no unrelated document-root content is removed.
& ssh @sshArgs $connection "chmod 600 '$($config.publicDirectory)/.storage-config.php'; tar -xzf '$($config.imageDirectory)/ui-storage.tar.gz' -C '$($config.publicDirectory)'; php -l '$($config.publicDirectory)/storage.php'"
if ($LASTEXITCODE -ne 0) { throw 'Remote extraction or PHP validation failed' }
Write-Host 'Xserver files uploaded. Verify HTTPS and shared camera flow before reporting publication.'
