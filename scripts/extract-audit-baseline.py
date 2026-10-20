"""Extract the verified published resource without running it or treating it as source."""
import hashlib, io, json, pathlib, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'validation/audit-repair/baseline'
DEST.mkdir(parents=True, exist_ok=True)
EXE = pathlib.Path('D:/techno/dist/科技观察-全额资金研究版.exe')
EXPECTED = 'e68ee81a8a42b8c26baad12bf7ce1b6640d6e0742ed3a1284631ba7cf9fcb4c2'
payload = EXE.read_bytes()
assert hashlib.sha256(payload).hexdigest() == EXPECTED
start = payload.find(b'PK\x03\x04')
end = payload.find(b'PK\x05\x06', start)
assert 0 < start < end
archive = zipfile.ZipFile(io.BytesIO(payload[start:end + 22]))
files = []
for name in archive.namelist():
    if not name.startswith('assets/') or name.endswith('/'):
        continue
    relative = pathlib.PurePosixPath(name)
    assert '..' not in relative.parts
    output = DEST / 'embedded' / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    data = archive.read(name)
    output.write_bytes(data)
    actual = ROOT / relative
    original = pathlib.Path('D:/techno') / relative
    files.append(dict(path=name, releaseSha256=hashlib.sha256(data).hexdigest(),
                      sourceSha256=hashlib.sha256(original.read_bytes()).hexdigest() if original.exists() else None,
                      normalizedEqual=original.exists() and original.read_text(encoding='utf-8-sig').replace('\r\n', '\n') == data.decode('utf-8-sig').replace('\r\n', '\n')))
report = dict(exeSha256=EXPECTED, baselineCommit='61443d4dbeb51efd18e0ef769c412b5f280dd2de', files=files,
              auditOriginalScriptsAttached=False, originalLiveExperimentUntouched='D:/techno/validation/auto-full-v4-30m-2026-10-20')
(DEST / 'source-comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(extracted=len(files), byteDifferences=[r['path'] for r in files if r['releaseSha256'] != r['sourceSha256']], normalizedDifferences=[r['path'] for r in files if not r['normalizedEqual']]), ensure_ascii=False))
