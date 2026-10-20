param([string]$ExecutableName='科技观察-验证增强版.exe',[string]$ArchiveName='科技观察-Windows模拟验证版.zip',[string]$VerificationName='Windows-verification.json')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
foreach($leaf in @($ExecutableName,$ArchiveName,$VerificationName)){if([IO.Path]::GetFileName($leaf) -ne $leaf){throw 'Release paths must be filenames'}}
$exe=Join-Path (Join-Path $root 'dist') $ExecutableName
$live=Get-Content -LiteralPath (Join-Path $root 'validation\paper-summary.json') -Raw|ConvertFrom-Json
$desktop=Get-Content -LiteralPath (Join-Path $root 'validation\desktop\launch-result.json') -Raw|ConvertFrom-Json
if(-not $live.live.done -or $live.live.elapsedMs -lt 3600000){throw 'Actual one-hour observation is incomplete'}
if(-not $desktop.ok){throw 'Desktop verification failed'}
if($ExecutableName.Contains('双轮') -and (-not $live.candidateLive.done -or $live.candidateLive.elapsedMs -lt 3600000)){throw 'Second observation has not actually completed'}
if(($ExecutableName.Contains('三轮') -or $ExecutableName.Contains('四轮')) -and (-not $live.smallBudgetLive.done -or $live.smallBudgetLive.elapsedMs -lt 3600000)){throw 'Initial small-budget observation has not actually completed'}
if($ExecutableName.Contains('四轮') -and (-not $live.smallBudgetV2Live.done -or $live.smallBudgetV2Live.elapsedMs -lt 3600000)){throw 'Corrected small-budget observation has not actually completed'}
$researchKeys=@('live');if($ExecutableName.Contains('双轮') -or $ExecutableName.Contains('三轮') -or $ExecutableName.Contains('四轮')){$researchKeys+=@('candidateLive')};if($ExecutableName.Contains('三轮') -or $ExecutableName.Contains('四轮')){$researchKeys+=@('smallBudgetLive')};if($ExecutableName.Contains('四轮')){$researchKeys+=@('smallBudgetV2Live')}
foreach($key in $researchKeys){$embedded=$desktop.embeddedResearch.$key;$expected=$live.$key;if(-not $embedded -or -not $embedded.done -or $embedded.elapsedMs -lt 3600000 -or [DateTimeOffset]::Parse($embedded.observedAt) -ne [DateTimeOffset]::Parse($expected.observedAt)){throw ('Verified EXE does not embed the complete expected observation: '+$key)}}
$hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
$verifiedCopy=Join-Path $root 'validation\desktop\单文件启动\TechScope.exe'
if((Get-FileHash -LiteralPath $verifiedCopy -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){throw 'Verification did not run the exact release EXE'}
if([DateTimeOffset]::Parse($desktop.verifiedAt) -lt [DateTimeOffset]::Parse($live.live.observedAt)){throw 'Final embedded observation has not been verified after completion'}
$verification=[ordered]@{
 version=(Get-Item -LiteralPath $exe).VersionInfo.FileVersion;exe=$ExecutableName;sha256=$hash;bytes=(Get-Item -LiteralPath $exe).Length
 investmentReadiness='unproven';languageModelTrained=$false;nonlinearResearchCandidateDeployed=$false
 desktop=$desktop;marketOpenButtonEvidence='validation/desktop/market-open-button-verification.json'
 liveObservation=[ordered]@{startedAt=$live.live.startedAt;observedAt=$live.live.observedAt;elapsedMs=$live.live.elapsedMs;ticks=$live.live.ticks;priceChangedTicks=$live.live.priceChangedTicks;netUnrealizedReturn=$live.live.netUnrealizedReturn;benchmarkUnrealizedReturn=$live.live.benchmarkUnrealizedReturn;cachedResponseTicks=$live.live.cachedResponseTicks;exceptionTicks=$live.live.exceptionTicks}
 candidateObservation=$live.candidateLive
 smallBudgetObservation=$live.smallBudgetLive
 smallBudgetCorrectedObservation=$live.smallBudgetV2Live
}
$verificationPath=Join-Path (Join-Path $root 'dist') $VerificationName
if($ExecutableName.Contains('自动模拟')){
 $autoExpected=Get-Content -LiteralPath (Join-Path $root 'validation\auto-history-30m\report.json') -Raw -Encoding utf8|ConvertFrom-Json
 if(-not $desktop.automaticReplay -or $desktop.automaticReplay.decisionsSha256 -ne $autoExpected.decisionsSha256 -or $desktop.automaticReplay.summary.completeWindows -ne $autoExpected.summary.completeWindows){throw 'Verified EXE does not contain the expected historical automatic decisions'}
 $verification['automaticHistoricalReplay']=$desktop.automaticReplay
}
if($ExecutableName.Contains('全额资金')){
 $full=Get-Content -LiteralPath (Join-Path $root 'validation\full-capital-optimization\report.json') -Raw -Encoding utf8|ConvertFrom-Json
 if(-not $desktop.fullCapitalResearch -or $desktop.fullCapitalResearch.selectionSha256 -ne $full.selectionSha256 -or $desktop.fullCapitalResearch.rows -ne $full.reports.Count -or $desktop.fullCapitalResearch.targets.achieved){throw 'Verified EXE does not contain expected unproven full-capital research'}
 $verification['fullCapitalResearch']=$desktop.fullCapitalResearch
}
$verification|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $verificationPath -Encoding utf8
$items=@($exe,($exe+'.sha256'),(Join-Path $root 'dist\Windows使用说明.txt'),(Join-Path $root 'dist\模拟投资验证报告.html'),$verificationPath)
$researchReport=Join-Path $root 'dist\AI投资方法调研与改进方案.html';if(Test-Path -LiteralPath $researchReport){$items+=@($researchReport)}
$autoReport=Join-Path $root 'dist\软件自动模拟-历史半小时检验.html';if(Test-Path -LiteralPath $autoReport){$items+=@($autoReport)}
foreach($name in @('模型优化与修复验证报告.html','1万元全额资金验证报告.html')){$file=Join-Path (Join-Path $root 'dist') $name;if(Test-Path -LiteralPath $file){$items+=@($file)}}
$archive=Join-Path (Join-Path $root 'dist') $ArchiveName
Compress-Archive -LiteralPath $items -DestinationPath $archive -Force
[PSCustomObject]@{exe=$exe;archive=$archive;sha256=$hash;liveCompleted=$true;desktopVerified=$true;investmentReadiness='unproven'}|ConvertTo-Json -Compress
