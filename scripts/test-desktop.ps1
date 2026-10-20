param([string]$Executable='', [switch]$Live, [string]$VerificationRoot='')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(-not $Executable){$Executable=Join-Path $projectRoot 'dist\TechScope-Windows.exe'}
if(-not (Test-Path -LiteralPath $Executable)){throw 'Desktop EXE has not been built'}
$Executable=(Resolve-Path -LiteralPath $Executable).Path
if(-not $VerificationRoot){$VerificationRoot=Join-Path $projectRoot 'validation\desktop'}
$verifyRoot=[IO.Path]::GetFullPath($VerificationRoot)
$runId='run-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
$sessionRoot=Join-Path $verifyRoot $runId
$isolated=Join-Path $sessionRoot '单文件启动'
$profile=Join-Path $sessionRoot 'profile'
$firstRoot=Join-Path $sessionRoot 'first-launch'
$restartRoot=Join-Path $sessionRoot 'restart-launch'
foreach($directory in @($isolated,$firstRoot,$restartRoot)){New-Item -ItemType Directory -Path $directory -Force | Out-Null}
$target=Join-Path $isolated 'TechScope.exe'
Copy-Item -LiteralPath $Executable -Destination $target
$sourceHash=(Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant()
if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceHash){throw 'Isolated EXE hash mismatch'}
$firstReport=Join-Path $firstRoot 'launch-result.json'
$restartReport=Join-Path $restartRoot 'launch-result.json'
$report=Join-Path $verifyRoot 'launch-result.json'

function Start-Verification([string]$OutputPath){
 $arguments=@('--verify',('"'+$OutputPath+'"'),'--data-root',('"'+$profile+'"'))
 $instance=Start-Process -FilePath $target -ArgumentList $arguments -WindowStyle Hidden -PassThru
 if(-not $instance.WaitForInputIdle(10000)){throw 'Desktop did not start its window loop'}
 return $instance
}
function Read-CompletedVerification($Instance,[string]$OutputPath){
 $deadline=[DateTime]::UtcNow.AddSeconds(180)
 while(-not $Instance.WaitForExit(1000)){if([DateTime]::UtcNow -ge $deadline){$Instance.Kill();throw 'Desktop startup verification timed out; isolated evidence retained'}}
 if(-not (Test-Path -LiteralPath $OutputPath)){throw 'EXE produced no launch report'}
 $value=Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json
 if(-not $value.ok){Copy-Item -LiteralPath $OutputPath -Destination $report -Force;throw ('Desktop verification failed: '+$value.error)}
 $Instance.Refresh()
 if($Instance.ExitCode -ne 0){throw ('Desktop returned '+$Instance.ExitCode)}
 return $value
}

try{
 $process=Start-Verification $firstReport
 $duplicateReport=Join-Path $firstRoot 'duplicate-result.json'
 $duplicateArguments=@('--verify',('"'+$duplicateReport+'"'),'--data-root',('"'+$profile+'"'))
 $duplicate=Start-Process -FilePath $target -ArgumentList $duplicateArguments -WindowStyle Hidden -PassThru
 if(-not $duplicate.WaitForExit(8000)){$duplicate.Kill();throw 'Duplicate launch created another running instance'}
 if($duplicate.ExitCode -ne 0 -or (Test-Path -LiteralPath $duplicateReport)){throw 'Duplicate launch was not suppressed'}
 $firstResult=Read-CompletedVerification $process $firstReport
 if($firstResult.continuousPersistence.prevSnapshotSeen){throw 'First launch unexpectedly reused another verification snapshot'}
 $restartProcess=Start-Verification $restartReport
 $result=Read-CompletedVerification $restartProcess $restartReport
 $old=$firstResult.continuousPersistence
 $new=$result.continuousPersistence
 if(-not $new.prevSnapshotSeen -or $new.previousNonce -ne $old.nonce -or $new.previousAccountId -ne $old.accountId -or $new.previousIntegrityHash -ne $old.integrityHash -or $new.previousEquity -ne $old.equity -or $new.previousCash -ne $old.cash -or $new.accountId -ne $old.accountId -or $new.integrityHash -ne $old.integrityHash){throw 'Real process restart did not preserve the prior account snapshot, cash, equity, nonce and integrity hash'}
 $result | Add-Member -NotePropertyName duplicateLaunchSuppressed -NotePropertyValue $true -Force
 $result | Add-Member -NotePropertyName continuousRestartVerified -NotePropertyValue $true -Force
 $result | Add-Member -NotePropertyName verifiedExecutableSha256 -NotePropertyValue $sourceHash -Force
 $result | Add-Member -NotePropertyName verificationSessionRoot -NotePropertyValue $sessionRoot -Force
 $result | Add-Member -NotePropertyName firstLaunchReport -NotePropertyValue $firstReport -Force
 $result | Add-Member -NotePropertyName restartLaunchReport -NotePropertyValue $restartReport -Force
 $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $report -Encoding utf8
 $result | ConvertTo-Json -Depth 20
}catch{
 $failure=[ordered]@{ok=$false;error=$_.Exception.Message;at=[DateTime]::UtcNow.ToString('o');sessionRoot=$sessionRoot;firstLaunchReport=$firstReport;restartLaunchReport=$restartReport;executableSha256=$sourceHash;checks=@();network=$null;continuousPersistence=$null}
 $lastNative=if(Test-Path -LiteralPath $restartReport){$restartReport}elseif(Test-Path -LiteralPath $firstReport){$firstReport}else{$null}
 if($lastNative){try{$nativeEvidence=Get-Content -LiteralPath $lastNative -Raw | ConvertFrom-Json;$failure.checks=$nativeEvidence.checks;$failure.network=$nativeEvidence.network;$failure.continuousPersistence=$nativeEvidence.continuousPersistence}catch{}}
 $failureText=$failure | ConvertTo-Json -Depth 20
 $failureText | Set-Content -LiteralPath (Join-Path $sessionRoot 'script-failure.json') -Encoding utf8
 $failureText | Set-Content -LiteralPath $report -Encoding utf8
 foreach($ownedProcess in @($process,$restartProcess)){if($ownedProcess){try{if(-not $ownedProcess.HasExited){$ownedProcess.Kill()}}catch{}}}
 throw
}
