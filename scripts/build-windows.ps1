$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$sdk=Join-Path $root 'tools\webview2\sdk'
if(-not (Test-Path -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'))){throw 'Download the official Microsoft.Web.WebView2 NuGet package before building'}
$build=Join-Path $root 'build\windows'
$stage=Join-Path $build 'payload'
$assetDir=Join-Path $stage 'assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
foreach($name in @('index.html','style.css','seed.js','trading-calendar.js','fee-profile.js','audit-identity.js','news-facts.js','analysis.js','market.js','forecast-journal.js','corporate-actions.js','corporate-events.js','paper-account.js','paper-engine.js','research-results.js','assurance-ui.js','ui.js')){Copy-Item -LiteralPath (Join-Path $root ('assets\'+$name)) -Destination (Join-Path $assetDir $name) -Force}
Copy-Item -LiteralPath (Join-Path $root 'windows\desktop.css') -Destination (Join-Path $assetDir 'desktop.css') -Force
$html=Get-Content -LiteralPath (Join-Path $assetDir 'index.html') -Raw
$policy="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"
$html=$html.Replace('</head>',('<meta http-equiv="Content-Security-Policy" content="'+$policy+'"><link rel="stylesheet" href="desktop.css"></head>'))
[IO.File]::WriteAllText((Join-Path $assetDir 'index.html'),$html,[Text.UTF8Encoding]::new($false))
foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')){Copy-Item -LiteralPath (Join-Path $sdk ('lib\net462\'+$name)) -Destination (Join-Path $stage $name) -Force}
Copy-Item -LiteralPath (Join-Path $sdk 'runtimes\win-x64\native\WebView2Loader.dll') -Destination (Join-Path $stage 'WebView2Loader.dll') -Force
$licenseFiles=@(Get-ChildItem -LiteralPath $sdk -File | Where-Object {$_.Name -match 'LICENSE|NOTICE'})
foreach($license in $licenseFiles){Copy-Item -LiteralPath $license.FullName -Destination (Join-Path $stage $license.Name) -Force}
$zip=Join-Path $build 'payload.zip'
if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe=Join-Path $root 'dist\TechScope-Windows.exe'
$args=@('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',('/out:'+$exe),('/resource:'+$zip+',TechScope.Payload.zip'),'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Net.Http.dll','/reference:System.Web.Extensions.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll',('/reference:'+(Join-Path $stage 'Microsoft.Web.WebView2.Core.dll')),('/reference:'+(Join-Path $stage 'Microsoft.Web.WebView2.WinForms.dll')),(Join-Path $root 'windows\Program.cs'),(Join-Path $root 'windows\DesktopServices.cs'),(Join-Path $root 'windows\DesktopForm.cs'),(Join-Path $root 'windows\AssemblyInfo.cs'))
& $csc @args
if($LASTEXITCODE -ne 0){throw 'Windows EXE compilation failed'}
$hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
[PSCustomObject]@{exe=$exe;bytes=(Get-Item -LiteralPath $exe).Length;sha256=$hash} | ConvertTo-Json -Compress
