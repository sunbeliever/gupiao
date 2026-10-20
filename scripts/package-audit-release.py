"""Validate the actual release payload, generate its gate, and package whitelisted evidence."""
import argparse, datetime, hashlib, html, io, json, pathlib, re, subprocess, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'validation/audit-repair'
FILES = ['paper-engine.js','paper-account.js','trading-calendar.js','fee-profile.js','audit-identity.js','corporate-actions.js','corporate-events.js','analysis.js','market.js','news-facts.js','seed.js']
OLD_SHA = 'e68ee81a8a42b8c26baad12bf7ce1b6640d6e0742ed3a1284631ba7cf9fcb4c2'
def sha(data): return hashlib.sha256(data).hexdigest()
def read_json(file): return json.loads(file.read_text(encoding='utf-8-sig'))
def write_json(file, data): file.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT).decode('utf-8').strip()
def validate():
    exe = ROOT / 'dist/TechScope-Windows.exe'
    binary = exe.read_bytes()
    start = binary.find(b'PK\x03\x04'); end = binary.find(b'PK\x05\x06',start)
    assert 0 < start < end, 'Missing embedded payload'
    payload = zipfile.ZipFile(io.BytesIO(binary[start:end+22]))
    source_hashes = {}
    # Compare all bundled assets with the authoritative source or actual staged HTML.
    for name in payload.namelist():
        if not name.startswith('assets/') or name.endswith('/'): continue
        relative = pathlib.PurePosixPath(name)
        assert '..' not in relative.parts
        expected = ROOT / relative
        if name == 'assets/index.html': expected = ROOT / 'build/windows/payload/assets/index.html'
        if name == 'assets/desktop.css': expected = ROOT / 'windows/desktop.css'
        assert expected.is_file() and payload.read(name) == expected.read_bytes(), 'Release/source mismatch: '+name
        source_hashes[name] = sha(expected.read_bytes())
    runtime = {name:sha((ROOT/'assets'/name).read_bytes()) for name in FILES}
    tests = (EVIDENCE/'full-js-regression.log').read_text(encoding='utf-8-sig')
    count = int(re.search(r'\btests (\d+)',tests).group(1)); failed = int(re.search(r'\bfail (\d+)',tests).group(1))
    assert count >= 169 and failed == 0 and int(re.search(r'\bpass (\d+)',tests).group(1)) == count
    assert 'PASS 43 desktop security/cache behaviors' in (EVIDENCE/'native-store-regression.log').read_text(encoding='utf-8-sig')
    native = read_json(EVIDENCE/'desktop-final/launch-result.json')
    assert native['ok'] and native['verifiedExecutableSha256'] == sha(binary)
    assert native['continuousRestartVerified'] and native['duplicateLaunchSuppressed']
    assert native['network']['allHistoriesExpected'] and native['network']['historyValidation']['ok']
    assert len(native['network']['historyStatuses']) == 19 and all(x['ok'] for x in native['network']['historyStatuses'])
    assert native['network']['liveQuotes'] and native['network']['liveNews'] and native['network']['liveAnnouncements']
    persistence = native['continuousPersistence']
    assert persistence['prevSnapshotSeen'] and persistence['equity'] < 10000 and persistence['equity'] == persistence['previousEquity']
    old = pathlib.Path('D:/techno/dist/科技观察-全额资金研究版.exe')
    assert sha(old.read_bytes()) == OLD_SHA, 'Original EXE changed'
    baseline = read_json(EVIDENCE/'baseline/behavior-reproduction.json')
    embedded = read_json(EVIDENCE/'baseline/embedded-report-reproduction.json')
    assert baseline['triggered'] == baseline['total'] == 8 and embedded['allMatch']
    replay = read_json(EVIDENCE/'offline-replay-ledger.json')
    assert replay['allEquivalent'] and len(replay['results']) == 8
    gate = dict(schema='continuous-release-gate-v1',generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),exeSha256=sha(binary),runtimeFiles=runtime,
                tests=dict(passed=True,failed=failed,count=count,sourceHashes=runtime),
                native=dict(passed=True,persistencePassed=True,networkPassed=True,allHistoriesCurrent=True,checks=len(native['checks']),reportSha256=sha((EVIDENCE/'desktop-final/launch-result.json').read_bytes()),nativeServicesSourceSha256=sha((ROOT/'windows/DesktopServices.cs').read_bytes())),
                sourceAssets=source_hashes,baselineUnchanged=True,originalReviewScriptsProvided=False)
    build=read_json(EVIDENCE/'market-transport.build.json')
    assert sha((EVIDENCE/'market-transport.exe').read_bytes())==build['sha256']
    transport_sources={name:sha((ROOT/'windows'/name).read_bytes()) for name in ['DesktopServices.cs','MarketTransport.cs']}
    assert all(build['sourceHashes']['windows/'+name]==value for name,value in transport_sources.items())
    transport_proof=read_json(EVIDENCE/'native-network/native-helper-verification.json')
    assert transport_proof['helperSha256']==build['sha256'] and all(row['ok'] and row['completedDataAsOf']=='2026-10-19' for row in transport_proof['runs'])
    assert len(transport_proof['runs'])==2 and all(row['exitCode']!=0 and row['stdoutEmpty'] for row in transport_proof['rejected'])
    gate['nativeTransport']=dict(kind='dotnet-desktop-http-v1',exeSha256=build['sha256'],sourceHashes=transport_sources)
    write_json(EVIDENCE/'release-gate.json',gate)
    return exe, gate, native

def package(exe,gate,native,forward_id=None):
    commit = git('rev-parse','HEAD'); branch = git('branch','--show-current')
    assert branch == 'fix/auditable-paper-account'
    assert not git('status','--porcelain'), 'Commit the reviewed repair before packaging'
    name = '科技观察-持续账户审计版.exe'; output = ROOT/'dist'/name
    assert not output.exists(), 'Never overwrite a released named EXE'
    output.write_bytes(exe.read_bytes())
    matrix = read_json(ROOT/'docs/audit-repair-2026-10-20.json')
    def esc(x): return html.escape(str(x))
    rows = ''.join('<tr>'+''.join('<td>'+esc(row[key])+'</td>' for key in ['id','issue','evidence','change','regression','uncovered'])+'</tr>' for row in matrix['matrix'])
    paragraphs = ''.join('<p>'+esc(x)+'</p>' for x in matrix['classification'])
    title = matrix['title']
    report = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font:16px/1.7 "Microsoft YaHei",sans-serif;margin:36px;color:#17304d}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #bac6d8;padding:10px;vertical-align:top}th{background:#eef3fa}code{overflow-wrap:anywhere}</style><h1>'+esc(title)+'</h1><p>'+esc(matrix['scope'])+'</p><p>源码分支 '+esc(branch)+'；提交 <code>'+commit+'</code></p><p>新EXE SHA256 <code>'+gate['exeSha256']+'</code></p><p>正式JS回归 '+str(gate['tests']['count'])+' 项全通过；原生安全缓存43项；真实EXE '+str(len(native['checks']))+'项、全19只日线同步和两进程亏损恢复通过。8组人工回放逐笔一致。</p><p>以上是工程证据，当前20交易日投资优势仍未验证；未承诺70%盈利或未来年收益。</p><table><thead><tr>'+''.join('<th>'+x+'</th>' for x in ['编号','问题','原证据','修改','正确行为回归','未覆盖'])+'</tr></thead><tbody>'+rows+'</tbody></table><h2>证据分类</h2>'+paragraphs+'<p>'+esc(matrix['reviewScriptLimit'])+'</p><p>'+esc(matrix['modelPolicy'])+'</p><p>'+esc(matrix['acceptanceLimit'])+'</p><p>新前瞻ID：'+esc(forward_id or '尚未启动，不冒称已完成')+'。真实状态以随包manifest和ticks为准，研究脚本与UI账户不得合并收益。</p></html>'
    report_file = ROOT/'dist/专项修复验收报告.html'; report_file.write_text(report,encoding='utf-8')
    forward_binding=None
    if forward_id:
        frozen=read_json(ROOT/'validation/continuous'/forward_id/'manifest.json')
        assert frozen['files']==gate['runtimeFiles'], 'Forward/core strategy sources differ from the delivered release'
        forward_binding=dict(id=forward_id,frozenExeSha256=frozen['exeSha256'],deliveredExeSha256=gate['exeSha256'],allElevenRuntimeFilesByteEqual=True,distinctUiRelease=frozen['exeSha256']!=gate['exeSha256'],notClaimedAsDirectExePerformance=True)
        report += '<p>前瞻绑定：<code>'+esc(json.dumps(forward_binding,ensure_ascii=False))+'</code>。1.6.0.1仅增加桌面相同输入预测缓存，11个分析/决策/账务模块与1100冻结版本字节一致；观察仍属于其原冻结EXE和独立执行模式，不回写为新UI版本的直接运行收益。</p>'
        report_file.write_text(report,encoding='utf-8')
    manifest = dict(version='1.6.0.1',branch=branch,commit=commit,exe=name,exeSha256=gate['exeSha256'],baselineCommit=matrix['baselineCommit'],baselineExeSha256=OLD_SHA,
                    jsTests=gate['tests']['count'],nativeStoreTests=43,nativeChecks=len(native['checks']),nativeExpectedAsOf=native['network']['expectedCompletedSession'],forwardId=forward_id,unverifiedInvestmentPerformance=True)
    manifest['forwardBinding']=forward_binding
    write_json(ROOT/'dist/audit-delivery-manifest.json',manifest)
    archive = ROOT/'dist/科技观察-持续账户审计修复完整包.zip'
    assert not archive.exists(), 'Never overwrite a delivered package'
    evidence_files = [EVIDENCE/'release-gate.json',EVIDENCE/'full-js-regression.log',EVIDENCE/'native-store-regression.log',EVIDENCE/'offline-replay-ledger.json',EVIDENCE/'market-transport.build.json',EVIDENCE/'market-transport.exe']
    evidence_files += list((EVIDENCE/'baseline').glob('*.json'))
    evidence_files += list((EVIDENCE/'native-network').glob('*.json'))
    evidence_files += list((EVIDENCE/'native-network').glob('*.md'))
    desktop = pathlib.Path(native['verificationSessionRoot'])
    evidence_files += list(desktop.glob('*-launch/launch-result.json')) + list(desktop.glob('*-launch/*.png'))
    evidence_files += [EVIDENCE/'desktop-final/launch-result.json']
    if forward_id:
        directory=ROOT/'validation/continuous'/forward_id
        # Snapshot only; a running account keeps its authoritative append-only log in place.
        evidence_files += [p for p in directory.iterdir() if p.is_file() and p.suffix in ('.json','.jsonl') and p.name not in ('state.json','status.json')]
        evidence_files += list((directory/'sources').glob('*.js'))
        evidence_files += list((directory/'sources').glob('*.cs'))
        evidence_files += [directory/'market-transport.exe'] if (directory/'market-transport.exe').is_file() else []
        evidence_files += [directory/'release.exe',directory/'driver-source.js']
        evidence_files += [directory/'experiment.claim'] if (directory/'experiment.claim').is_file() else []
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        z.write(output,name);z.write(report_file,report_file.name);z.write(ROOT/'docs/release-usage-1.6.txt','使用与制作说明.txt')
        z.write(ROOT/'docs/diagnostic-incident-2026-10-20.txt','诊断记录与凭据轮换说明.txt')
        z.write(ROOT/'dist/audit-delivery-manifest.json','manifest.json')
        tracked = subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode('utf-8').split('\0')
        for relative in tracked:
            if relative and (ROOT/relative).is_file(): z.write(ROOT/relative,'source/'+relative)
        # Required unchanged fixture for the preserved historical candidate tests.
        z.write(ROOT/'validation/ml-research/current-scores.json','source/validation/ml-research/current-scores.json')
        z.writestr('source/audit-repair.patch',subprocess.check_output(['git','diff',matrix['baselineCommit'],commit],cwd=ROOT))
        bundle=ROOT/'dist/审计修复源码分支.bundle'
        subprocess.run(['git','bundle','create',str(bundle),'baseline/techscope-1.5.1','fix/auditable-paper-account'],cwd=ROOT,check=True)
        z.write(bundle,'审计修复源码分支.bundle')
        for file in evidence_files:
            assert file.is_file(), str(file)
            relative='evidence/'+file.relative_to(ROOT/'validation').as_posix()
            data=file.read_bytes()
            if file.name=='ticks.jsonl':
                # Capture a complete prefix, never half an in-progress append. The
                # authoritative live ledger is left untouched and keeps growing.
                data=data[:data.rfind(b'\n')+1]
                lines=data.splitlines()
                for line in lines: json.loads(line)
                z.writestr(relative,data)
                z.writestr('evidence/continuous/snapshot-cutoff.json',json.dumps(dict(experimentId=forward_id,completeTicks=len(lines),lastDecisionAt=json.loads(lines[-1])['decisionAt'] if lines else None,immutableDeliverySnapshot=True,authoritativeAccountContinues=True),ensure_ascii=False))
                if lines:
                    last=json.loads(lines[-1])
                    z.writestr('evidence/continuous/'+forward_id+'/state.json',json.dumps(last['state'],ensure_ascii=False))
                    z.writestr('evidence/continuous/'+forward_id+'/status.json',json.dumps(dict(cutoff=last['decisionAt'],summary=last['summary'],runStatus=last['runStatus'],snapshotOnly=True),ensure_ascii=False))
            else: z.writestr(relative,data)
        old_run=pathlib.Path('D:/techno/validation/auto-full-v4-30m-2026-10-20')
        for name in ['declaration.json','desktop-deployment-binding.json','manifest.json','status.json','result.json','ticks.jsonl','analysis.js','paper-engine.js','market.js','corporate-actions.js','corporate-events.js','seed.js']:
            z.write(old_run/name,'evidence/original-1.5.1-0930/'+name)
        aborted=ROOT/'validation/continuous/continuous-etf-audit-20261020-1040'
        for name in ['manifest.json','aborted-before-entry.json','state.json','ticks.jsonl','release-verification.json','driver-source.js','experiment.claim']:
            z.write(aborted/name,'evidence/continuous-aborted-1040/'+name)
        reports=ROOT/'reports/continuous'
        for experiment in ['continuous-etf-audit-20261020-1040',forward_id]:
            if experiment and (reports/experiment).is_dir():
                for file in (reports/experiment).glob('*'):
                    if file.is_file() and file.suffix in ('.json','.html'): z.write(file,'evidence/derived-reports/'+experiment+'/'+file.name)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None and sha(z.read(name))==gate['exeSha256']
    return dict(exe=str(output),sha256=gate['exeSha256'],zip=str(archive),zipSha256=sha(archive.read_bytes()),report=str(report_file),commit=commit)

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--package',action='store_true');parser.add_argument('--forward-id');args=parser.parse_args()
    exe,gate,native=validate()
    print(json.dumps(package(exe,gate,native,args.forward_id) if args.package else dict(gate=str(EVIDENCE/'release-gate.json'),sha256=gate['exeSha256'],tests=gate['tests']['count']),ensure_ascii=False))
