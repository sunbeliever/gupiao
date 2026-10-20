"""Build a Java/WebView Android APK using individually licensed open-source tools.

No Android SDK installation, sdkmanager, Gradle, or SDK agreement acceptance is
performed. android-all is only a compile/resource dependency, never APK content.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
import pathlib
import re
import secrets
import shutil
import struct
import subprocess
import sys
import time
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
DOWNLOADS = TOOLS / "downloads"
ANDROID = DOWNLOADS / "android-all-15-robolectric-12714715.jar"
AAPT = TOOLS / "aapt2" / "aapt2.exe"
R8 = DOWNLOADS / "r8-8.7.18.jar"
APKSIG = DOWNLOADS / "apksig-8.7.3.jar"
JDK_NAME = "microsoft-jdk-21.0.12.1-windows-x64.zip"
JDK_URL = "https://aka.ms/download-jdk/" + JDK_NAME
GOOGLE_MAVEN = "https://dl.google.com/dl/android/maven2/"
ARTIFACTS = [
    (JDK_NAME, JDK_URL, "sha256", JDK_URL + ".sha256sum.txt"),
    (ANDROID.name, "https://repo.maven.apache.org/maven2/org/robolectric/android-all/15-robolectric-12714715/" + ANDROID.name, "sha1", None),
    ("aapt2-8.7.3-12006047-windows.jar", GOOGLE_MAVEN + "com/android/tools/build/aapt2/8.7.3-12006047/aapt2-8.7.3-12006047-windows.jar", "sha1", None),
    (R8.name, GOOGLE_MAVEN + "com/android/tools/r8/8.7.18/" + R8.name, "sha1", None),
    (APKSIG.name, GOOGLE_MAVEN + "com/android/tools/build/apksig/8.7.3/" + APKSIG.name, "sha1", None),
]
POMS = {
    "android-all.pom": "https://repo.maven.apache.org/maven2/org/robolectric/android-all/15-robolectric-12714715/android-all-15-robolectric-12714715.pom",
    "aapt2.pom": GOOGLE_MAVEN + "com/android/tools/build/aapt2/8.7.3-12006047/aapt2-8.7.3-12006047.pom",
    "r8.pom": GOOGLE_MAVEN + "com/android/tools/r8/8.7.18/r8-8.7.18.pom",
    "apksig.pom": GOOGLE_MAVEN + "com/android/tools/build/apksig/8.7.3/apksig-8.7.3.pom",
}


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TechScope-build/1.0"}), timeout=90)


def file_hash(filename, algorithm="sha256"):
    digest = hashlib.new(algorithm)
    with filename.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(artifact):
    name, url, algorithm, checksum_url = artifact
    destination = DOWNLOADS / name
    checksum_path = destination.with_suffix(destination.suffix + "." + algorithm)
    if not checksum_path.exists():
        with request(checksum_url or url + "." + algorithm) as response:
            checksum_text = response.read().decode("ascii").strip()
        match = re.search(r"\b[0-9a-fA-F]{" + str(hashlib.new(algorithm).digest_size * 2) + r"}\b", checksum_text)
        if not match:
            raise RuntimeError("Invalid upstream checksum: " + name)
        checksum_path.write_text(match.group(0).lower(), encoding="ascii")
    expected = checksum_path.read_text(encoding="ascii").strip()
    if destination.exists() and file_hash(destination, algorithm) == expected:
        return name + " cached and verified"
    temporary = destination.with_suffix(destination.suffix + ".part")
    for attempt in range(3):
        try:
            print("Downloading " + name, flush=True)
            with request(url) as response, temporary.open("wb") as output:
                shutil.copyfileobj(response, output, length=1024 * 1024)
            if file_hash(temporary, algorithm) != expected:
                raise RuntimeError("Upstream checksum mismatch: " + name)
            temporary.replace(destination)
            return name + " downloaded and verified"
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def extract_checked(archive, destination):
    destination.mkdir(parents=True, exist_ok=True)
    base = destination.resolve()
    with zipfile.ZipFile(archive) as source:
        for item in source.infolist():
            target = (base / item.filename).resolve()
            if not target.is_relative_to(base):
                raise RuntimeError("Unsafe ZIP member: " + item.filename)
        source.extractall(base)


def jdk_bin():
    directories = sorted((TOOLS / "jdk").glob("*/bin/java.exe"))
    if not directories:
        raise RuntimeError("Portable JDK has not been prepared")
    return directories[0].parent


def run(arguments, timeout=120):
    result = subprocess.run([str(value) for value in arguments], cwd=ROOT, capture_output=True,
                            text=True, encoding="utf-8", errors="replace", timeout=timeout,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode:
        raise RuntimeError(pathlib.Path(str(arguments[0])).name + " failed:\n" + (result.stdout + result.stderr)[-7000:])
    return (result.stdout + result.stderr).strip()


def bootstrap():
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as workers:
        for result in workers.map(download, ARTIFACTS):
            print(result, flush=True)
    if not list((TOOLS / "jdk").glob("*/bin/java.exe")):
        extract_checked(DOWNLOADS / JDK_NAME, TOOLS / "jdk")
    if not AAPT.exists():
        extract_checked(DOWNLOADS / "aapt2-8.7.3-12006047-windows.jar", AAPT.parent)
    with zipfile.ZipFile(ANDROID) as framework:
        for entry in ["resources.arsc", "android/app/Activity.class", "android/webkit/JavascriptInterface.class"]:
            if entry not in framework.namelist():
                raise RuntimeError("Android framework dependency lacks " + entry)
    licenses = TOOLS / "licenses"
    licenses.mkdir(exist_ok=True)
    for name, url in POMS.items():
        if not (licenses / name).exists():
            with request(url) as response:
                (licenses / name).write_bytes(response.read())
    for archive, name in [(R8, "r8-LICENSE.txt"), (APKSIG, "apksig-LICENSE.txt")]:
        with zipfile.ZipFile(archive) as source:
            (licenses / name).write_bytes(source.read("LICENSE"))
    versions = {"java": run([jdk_bin() / "java.exe", "--version"]), "aapt2": run([AAPT, "version"]),
                "d8": run([jdk_bin() / "java.exe", "-cp", R8, "com.android.tools.r8.D8", "--version"])}
    manifest = [{"name": artifact[0], "url": artifact[1], "sha256": file_hash(DOWNLOADS / artifact[0])} for artifact in ARTIFACTS]
    (TOOLS / "toolchain.json").write_text(json.dumps({"artifacts": manifest, "versions": versions}, indent=2), encoding="utf-8")
    print("Open-source Android toolchain prepared; Android SDK agreement was not accepted.", flush=True)


SIGNER_SOURCE = r'''import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
public final class ApkSign {
  public static void main(String[] args) throws Exception {
    if (args[0].equals("sign")) {
      char[] password = new String(Files.readAllBytes(Paths.get(args[4])), "UTF-8").trim().toCharArray();
      KeyStore store = KeyStore.getInstance("PKCS12");
      try (InputStream input = new FileInputStream(args[3])) { store.load(input, password); }
      PrivateKey key = (PrivateKey) store.getKey("techscope", password);
      List<X509Certificate> certificates = new ArrayList<>();
      for (java.security.cert.Certificate certificate : store.getCertificateChain("techscope")) certificates.add((X509Certificate)certificate);
      ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder("techscope", key, certificates).build();
      new ApkSigner.Builder(Collections.singletonList(signer)).setInputApk(new File(args[1])).setOutputApk(new File(args[2]))
        .setMinSdkVersion(23).setV1SigningEnabled(true).setV2SigningEnabled(true).setV3SigningEnabled(true).build().sign();
      Arrays.fill(password, '\0');
    } else {
      ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[1])).setMinCheckedPlatformVersion(23).build().verify();
      if (!result.isVerified() || !result.isVerifiedUsingV2Scheme()) throw new SecurityException("APK signature verification failed: " + result.getErrors());
      System.out.println("APK signature verified: v1=" + result.isVerifiedUsingV1Scheme() + ", v2=" + result.isVerifiedUsingV2Scheme() + ", v3=" + result.isVerifiedUsingV3Scheme());
    }
  }
}
'''


def signer():
    folder = TOOLS / "signer"
    folder.mkdir(exist_ok=True)
    java = folder / "ApkSign.java"
    if not java.exists() or java.read_text(encoding="utf-8") != SIGNER_SOURCE or not (folder / "ApkSign.class").exists():
        java.write_text(SIGNER_SOURCE, encoding="utf-8")
        run([jdk_bin() / "javac.exe", "-encoding", "UTF-8", "-cp", APKSIG, "-d", folder, java])
    keystore = TOOLS / "techscope-release.p12"
    password = TOOLS / "keystore-password.txt"
    if keystore.exists() != password.exists():
        raise RuntimeError("Signing key/password pair is incomplete; restore the matching pair instead of replacing the key")
    if not keystore.exists():
        password.write_text(secrets.token_urlsafe(40), encoding="utf-8")
        run([jdk_bin() / "keytool.exe", "-genkeypair", "-alias", "techscope", "-keyalg", "RSA", "-keysize", "3072",
             "-validity", "10000", "-dname", "CN=TechScope Local Release", "-storetype", "PKCS12", "-keystore", keystore,
             "-storepass:file", password, "-noprompt"])
    return [jdk_bin() / "java.exe", "-cp", str(folder) + os.pathsep + str(APKSIG), "ApkSign"], keystore, password


def package_zip(resource_apk, dex_dir, assets, output):
    entries = {}
    with zipfile.ZipFile(resource_apk) as resources:
        for item in resources.infolist():
            if not item.is_dir():
                entries[item.filename] = resources.read(item)
    for filename in dex_dir.glob("*.dex"):
        entries[filename.name] = filename.read_bytes()
    for filename in sorted(assets.rglob("*")):
        if filename.is_file():
            entries["assets/" + filename.relative_to(assets).as_posix()] = filename.read_bytes()
    with zipfile.ZipFile(output, "w") as apk:
        for name, content in entries.items():
            item = zipfile.ZipInfo(name, date_time=(2025, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_STORED
            offset = apk.fp.tell() + 30 + len(name.encode("utf-8"))
            padding = (-offset) % 4
            if padding:
                item.extra = struct.pack("<HH", 0xFFFF, padding) + b"\0" * padding
            apk.writestr(item, content)


def verify(apk):
    run([sys.executable, ROOT / "scripts" / "verify-apk.py", apk])
    command, _, _ = signer()
    print(run(command + ["verify", apk]), flush=True)
    badging = run([AAPT, "dump", "badging", apk])
    for expected in ["name='cn.techscope.app'", "minSdkVersion:'23'", "targetSdkVersion:'35'"]:
        if expected not in badging:
            raise RuntimeError("Unexpected Android manifest: " + expected)
    print("Manifest verified: cn.techscope.app, min API 23, target API 35", flush=True)


def build(manifest, sources, assets, resources, build_dir, output):
    build_dir.mkdir(parents=True, exist_ok=True)
    classes = build_dir / "classes"
    dex = build_dir / "dex"
    # Clear only these exact derived directories inside the selected build folder.
    for directory in [classes, dex]:
        if directory.resolve().parent != build_dir.resolve():
            raise RuntimeError("Unsafe build output path")
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir()
    resource_apk = build_dir / "resources.apk"
    link = [AAPT, "link", "-I", ANDROID, "--manifest", manifest, "--min-sdk-version", "23", "--target-sdk-version", "35", "-o", resource_apk]
    if resources and resources.exists():
        compiled = build_dir / "resources.zip"
        run([AAPT, "compile", "--dir", resources, "-o", compiled])
        link.append(compiled)
    run(link)
    if not sources:
        raise RuntimeError("No Java application sources found under src/")
    run([jdk_bin() / "javac.exe", "-encoding", "UTF-8", "-source", "8", "-target", "8", "-Xlint:-options", "-classpath", ANDROID, "-d", classes] + sources)
    class_jar = build_dir / "application-classes.jar"
    with zipfile.ZipFile(class_jar, "w", zipfile.ZIP_DEFLATED) as archive:
        for filename in sorted(classes.rglob("*.class")):
            archive.write(filename, filename.relative_to(classes).as_posix())
    run([jdk_bin() / "java.exe", "-cp", R8, "com.android.tools.r8.D8", "--release", "--min-api", "23", "--lib", ANDROID, "--output", dex, class_jar])
    unsigned = build_dir / "unsigned.apk"
    package_zip(resource_apk, dex, assets, unsigned)
    command, keystore, password = signer()
    output.parent.mkdir(parents=True, exist_ok=True)
    run(command + ["sign", unsigned, output, keystore, password])
    verify(output)
    print("Built " + str(output) + " (" + str(output.stat().st_size) + " bytes)", flush=True)
    return output


def smoke():
    folder = TOOLS / "smoke"
    source = folder / "src" / "cn" / "techscope" / "app" / "MainActivity.java"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_text('package cn.techscope.app; public class MainActivity extends android.app.Activity { public void onCreate(android.os.Bundle b) { super.onCreate(b); android.webkit.WebView view = new android.webkit.WebView(this); setContentView(view); view.loadData("Toolchain smoke test", "text/html", "UTF-8"); } }', encoding="utf-8")
    manifest = folder / "AndroidManifest.xml"
    manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="cn.techscope.app" android:versionCode="1" android:versionName="1.0"><uses-sdk android:minSdkVersion="23" android:targetSdkVersion="35"/><application android:label="TechScope"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>', encoding="utf-8")
    assets = folder / "assets"
    assets.mkdir(exist_ok=True)
    (assets / "index.html").write_text("<!doctype html><title>Toolchain smoke test</title>", encoding="utf-8")
    return build(manifest, [source], assets, None, folder / "build", folder / "probe.apk")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bootstrap", action="store_true", help="Prepare the local open-source toolchain only")
    parser.add_argument("--smoke", action="store_true", help="Compile and sign an isolated probe APK under tools/")
    parser.add_argument("--verify", type=pathlib.Path, help="Verify an existing release APK")
    options = parser.parse_args()
    try:
        if options.verify:
            verify(options.verify.resolve())
        elif options.bootstrap:
            bootstrap()
        elif options.smoke:
            smoke()
        else:
            manifest = ROOT / "AndroidManifest.xml"
            if not manifest.exists():
                raise RuntimeError("AndroidManifest.xml is missing from project root")
            build(manifest, sorted((ROOT / "src").rglob("*.java")), ROOT / "assets", ROOT / "res", ROOT / "build", ROOT / "dist" / "TechScope.apk")
    except Exception as error:
        print("Build failed: " + str(error), file=sys.stderr)
        sys.exit(1)
