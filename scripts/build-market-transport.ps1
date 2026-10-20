param([string]$OutputPath='')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(-not $OutputPath){$OutputPath=Join-Path $projectRoot 'validation\audit-repair\market-transport.exe'}
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
if(-not $OutputPath.StartsWith($projectRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Transport output must remain inside this project'}
if(Test-Path -LiteralPath $OutputPath){throw 'Transport output already exists; choose a new output path to retain earlier evidence'}
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
$sources=@('windows/DesktopServices.cs','windows/MarketTransport.cs','scripts/build-market-transport.ps1')
$sourceHashes=[ordered]@{}
foreach($name in $sources){$sourceHashes[$name]=(Get-FileHash -LiteralPath (Join-Path $projectRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
$compiler='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$compilerArguments=@('/nologo','/target:exe','/platform:x64','/optimize+','/codepage:65001',('/out:'+$OutputPath),'/reference:System.Net.Http.dll','/reference:System.Web.Extensions.dll',(Join-Path $projectRoot 'windows\DesktopServices.cs'),(Join-Path $projectRoot 'windows\MarketTransport.cs'))
& $compiler @compilerArguments
if($LASTEXITCODE -ne 0){throw 'Native market transport compilation failed'}
$manifest=[ordered]@{schema=1;transport='dotnet-desktop-http-v1';builtAt=[DateTime]::UtcNow.ToString('o');path=$OutputPath;sha256=(Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $OutputPath).Length;sourceHashes=$sourceHashes;compilerSha256=(Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLowerInvariant();policy='DesktopPolicy.AllowedDataUrl';httpImplementation='DesktopHttp';tls='platform_certificate_validation_tls12';externalRuntime='Windows .NET Framework';noRealOrders=$true}
$manifestPath=[IO.Path]::ChangeExtension($OutputPath,'.build.json')
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8
$manifest | ConvertTo-Json -Depth 8 -Compress
