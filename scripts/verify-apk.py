"""Check the release APK structure without an Android device."""
import pathlib
import struct
import sys
import zipfile

apk = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1] / "dist" / "TechScope.apk")
assert apk.is_file(), f"APK has not been built: {apk}"
with zipfile.ZipFile(apk) as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)), "APK contains duplicate ZIP entries"
    assert "AndroidManifest.xml" in names, "Manifest is missing"
    assert archive.read("AndroidManifest.xml")[:2] == b"\x03\x00", "Manifest is not Android binary XML"
    assert archive.read("classes.dex").startswith(b"dex\n"), "DEX bytecode is missing or invalid"
    assert "assets/index.html" in names, "Application page is missing"
    assert archive.testzip() is None, "APK ZIP CRC check failed"
    if "resources.arsc" in names:
        resource = archive.getinfo("resources.arsc")
        assert resource.compress_type == zipfile.ZIP_STORED, "Resource table must be uncompressed"
        with apk.open("rb") as stream:
            stream.seek(resource.header_offset + 26)
            name_length, extra_length = struct.unpack("<HH", stream.read(4))
        assert (resource.header_offset + 30 + name_length + extra_length) % 4 == 0, "Resource table must be aligned to 4 bytes"
    assert apk.stat().st_size < 20 * 1024 * 1024, "Framework compile dependency appears to be bundled into APK"
print(f"APK structure verified: {apk.name}, {apk.stat().st_size:,} bytes, {len(names)} entries")
