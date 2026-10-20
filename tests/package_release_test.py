import importlib.util, pathlib, tempfile, unittest, zipfile
spec=importlib.util.spec_from_file_location('release_packager',pathlib.Path(__file__).resolve().parents[1]/'scripts/package-audit-release.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
class PackageIntegrityTests(unittest.TestCase):
    def test_verifies_named_executable_after_later_claim_entries(self):
        with tempfile.TemporaryDirectory() as folder:
            file=pathlib.Path(folder)/'release.zip'
            with zipfile.ZipFile(file,'w') as z:z.writestr('application.exe',b'exact release');z.writestr('experiment.claim',b'')
            release.verify_archive(file,'application.exe',release.sha(b'exact release'))
            with self.assertRaises(AssertionError):release.verify_archive(file,'application.exe',release.sha(b'wrong'))
    def test_missing_executable_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            file=pathlib.Path(folder)/'release.zip'
            with zipfile.ZipFile(file,'w') as z:z.writestr('experiment.claim',b'')
            with self.assertRaises(KeyError):release.verify_archive(file,'application.exe',release.sha(b'exact release'))
if __name__=='__main__':unittest.main()
