param([string]$Executable='D:\techno\dist\TechScope-Windows.exe',[switch]$Live)
$ErrorActionPreference='Stop'
if(-not (Test-Path -LiteralPath $Executable)){throw 'Desktop EXE has not been built'}
$verifyRoot='D:\techno\validation\desktop'
$isolated=Join-Path $verifyRoot '单文件启动'
New-Item -ItemType Directory -Path $isolated -Force | Out-Null
$target=Join-Path $isolated 'TechScope.exe'
Copy-Item -LiteralPath $Executable -Destination $target -Force
$report=Join-Path $verifyRoot 'launch-result.json'
if(Test-Path -LiteralPath $report){Remove-Item -LiteralPath $report}
$arguments=@('--verify',('"'+$report+'"'),'--data-root',('"'+(Join-Path $verifyRoot 'profile')+'"'))
$process=Start-Process -FilePath $target -ArgumentList $arguments -WindowStyle Hidden -PassThru
if(-not $process.WaitForInputIdle(10000)){throw 'Desktop did not start its window loop'}
$duplicateReport=Join-Path $verifyRoot 'duplicate-result.json'
if(Test-Path -LiteralPath $duplicateReport){Remove-Item -LiteralPath $duplicateReport}
$duplicateArguments=@('--verify',('"'+$duplicateReport+'"'),'--data-root',('"'+(Join-Path $verifyRoot 'profile')+'"'))
$duplicate=Start-Process -FilePath $target -ArgumentList $duplicateArguments -WindowStyle Hidden -PassThru
if(-not $duplicate.WaitForExit(8000)){$duplicate.Kill();throw 'Duplicate launch created another running instance'}
if($duplicate.ExitCode -ne 0 -or (Test-Path -LiteralPath $duplicateReport)){throw 'Duplicate launch was not suppressed'}
if(-not $process.WaitForExit(90000)){$process.Kill();throw 'Desktop startup verification timed out'}
if(-not (Test-Path -LiteralPath $report)){throw 'EXE produced no launch report'}
$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
if(-not $result.ok){throw ('Desktop verification failed: '+$result.error)}
if($process.ExitCode -ne 0){throw ('Desktop returned '+$process.ExitCode)}
$result | Add-Member -NotePropertyName duplicateLaunchSuppressed -NotePropertyValue $true -Force
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $report -Encoding utf8
$result | ConvertTo-Json -Depth 8
