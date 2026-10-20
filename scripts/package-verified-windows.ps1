param([string]$OutputName='科技观察-验证增强版.exe')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$status=Get-Content -LiteralPath (Join-Path $root 'validation\live-paper\status.json') -Raw|ConvertFrom-Json
if(-not $status.done -or $status.elapsedMs -lt 3600000){throw 'The requested real one-hour observation has not finished'}
if($OutputName.Contains('双轮')){$second=Get-Content -LiteralPath (Join-Path $root 'validation\candidate-live\status.json') -Raw|ConvertFrom-Json;if(-not $second.done -or $second.elapsedMs -lt 3600000){throw 'Second real one-hour observation has not finished'}}
if($OutputName.Contains('三轮') -or $OutputName.Contains('四轮')){$third=Get-Content -LiteralPath (Join-Path $root 'validation\small-budget-live\status.json') -Raw|ConvertFrom-Json;if(-not $third.done -or $third.elapsedMs -lt 3600000){throw 'Initial small-budget observation has not finished'}}
if($OutputName.Contains('四轮')){$fourth=Get-Content -LiteralPath (Join-Path $root 'validation\small-budget-v2-live\status.json') -Raw|ConvertFrom-Json;if(-not $fourth.done -or $fourth.elapsedMs -lt 3600000){throw 'Corrected small-budget observation has not finished'}}
Push-Location $root
try{
 & node (Join-Path $PSScriptRoot 'prepare-research-results.js')
 if($LASTEXITCODE -ne 0){throw 'Research data generation failed'}
 & node (Join-Path $PSScriptRoot 'make-paper-report.js')
 if($LASTEXITCODE -ne 0){throw 'Paper report generation failed'}
 if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'make-online-research-report.js')){& node (Join-Path $PSScriptRoot 'make-online-research-report.js');if($LASTEXITCODE -ne 0){throw 'Online research report generation failed'}}
 if(Test-Path -LiteralPath (Join-Path $root 'validation\auto-history-30m\report.json')){& node (Join-Path $PSScriptRoot 'make-automatic-report.js');if($LASTEXITCODE -ne 0){throw 'Automatic replay report generation failed'}}
 if(Test-Path -LiteralPath (Join-Path $root 'validation\full-capital-optimization\report.json')){& node (Join-Path $PSScriptRoot 'make-cost-optimization-report.js');if($LASTEXITCODE -ne 0){throw 'Cost optimization report generation failed'};& node (Join-Path $PSScriptRoot 'make-full-capital-report.js');if($LASTEXITCODE -ne 0){throw 'Full-capital report generation failed'}}
 & (Join-Path $PSScriptRoot 'build-windows.ps1')
 if([IO.Path]::GetFileName($OutputName) -ne $OutputName -or -not $OutputName.EndsWith('.exe')){throw 'OutputName must be an EXE filename'}
 $exe=Join-Path (Join-Path $root 'dist') $OutputName
 Copy-Item -LiteralPath (Join-Path $root 'dist\TechScope-Windows.exe') -Destination $exe -Force
 Copy-Item -LiteralPath (Join-Path $root 'docs\windows-use.md') -Destination (Join-Path $root 'dist\Windows使用说明.txt') -Force
 $hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText(($exe+'.sha256'),($hash+'  '+$OutputName+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
 [PSCustomObject]@{exe=$exe;bytes=(Get-Item -LiteralPath $exe).Length;sha256=$hash;liveObservationCompleted=$true;startedAt=$status.startedAt;observedAt=$status.observedAt;ticks=$status.ticks} | ConvertTo-Json -Compress
}finally{Pop-Location}
