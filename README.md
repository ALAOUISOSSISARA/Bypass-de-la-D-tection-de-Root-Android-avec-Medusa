# android-root-bypass-lab

## LAB 12 — Android Root Detection Bypass with Medusa and Frida

**Course:** Mobile Application Security  
**Level:** Beginner  
**Platform:** Windows 10 + Android Emulator (API 30)

---

## Objective

Perform a step-by-step bypass of Android root detection using the Medusa instrumentation framework and Frida, then validate that the target application no longer detects a rooted environment.

The target application used in this lab is the **OWASP UnCrackable Level 3** (`owasp.mstg.uncrackable3`), a deliberately vulnerable Android app designed for mobile security training.

> Ethical notice: only apply these techniques on applications and devices you are authorized to test.

---

## Environment

| Component | Version |
|-----------|---------|
| OS | Windows 10 (10.0.19045) |
| Python | 3.12.10 |
| pip | 25.0.1 |
| Frida (PC) | 17.9.10 |
| frida-server | 17.9.10 (android-x86_64) |
| ADB | 1.0.41 (37.0.0) |
| Medusa | dev (124 modules) |
| Android Emulator | API 30 — x86_64 |
| Target App | OWASP UnCrackable Level 3 |

---

## Repository Structure

```
android-root-bypass-lab/
├── README.md
├── scripts/
│   ├── bypass_root.js       # Java-layer root bypass (Frida)
│   └── bypass_native.js     # Native-layer root bypass (optional)
```

---

## Step-by-Step Implementation

### Step 1 — Verify Prerequisites

```powershell
python --version
pip --version
adb version
adb devices
```

**Result:**
<img width="924" height="237" alt="image" src="https://github.com/user-attachments/assets/cd24945a-9381-40a7-989a-88bb8461a7d9" />


---

### Step 2 — Install Frida

```powershell
pip install --upgrade frida frida-tools
frida --version
python -c "import frida; print(frida.__version__)"
```

Both commands must print the same version number. This version must match the frida-server binary exactly.

<img width="627" height="81" alt="image" src="https://github.com/user-attachments/assets/a699db54-2b2e-4bb1-8955-23d28ebce018" />

---

### Step 3 — Deploy frida-server on the Emulator

Identify the CPU architecture:

```powershell
adb shell getprop ro.product.cpu.abi
# x86_64
```

Download the matching binary from https://github.com/frida/frida/releases/tag/17.9.10  
File: `frida-server-17.9.10-android-x86_64.xz` — decompress and rename to `frida-server`.

Push and start:

```powershell
adb root
adb push C:\frida-server /data/local/tmp/
adb shell chmod 755 /data/local/tmp/frida-server
adb shell "/data/local/tmp/frida-server &"
```





<img width="847" height="267" alt="image" src="https://github.com/user-attachments/assets/2e3c72c0-8f4c-4293-8767-054c768c1ceb" />

---

### Step 4 — Install Medusa

```powershell
git clone https://github.com/Ch0pin/medusa.git
cd medusa
pip install -r requirements.txt
python medusa.py --help
```

---

### Step 5 — Launch Medusa and Load Root Bypass Module

```powershell
python medusa.py -p owasp.mstg.uncrackable3
```

Select the emulator when prompted, then search for root bypass modules:

```
search root
```

Load the universal module:

```
use root_detection/universal_root_detection_bypass
```

---

### Step 6 — Run the Bypass with Frida (Plan B)

Since Medusa requires the app process to already be running and encounters a multi-PID issue with this target, the bypass is executed directly via Frida using the `--spawn` mode:

```powershell
frida -U -f owasp.mstg.uncrackable3 -l C:\bypass_root.js
```
## Validation

The app launches without displaying any "Root detected" dialog. All root checks are intercepted and neutralized at the Java layer.

**App running after bypass:**

<img width="854" height="560" alt="image" src="https://github.com/user-attachments/assets/51123d18-8dbf-45e0-93e7-6ba8ee1301e1" />


---

## How the Bypass Works

| Check | Method | Hook Applied |
|-------|--------|--------------|
| `Build.TAGS` | Java | Returns `release-keys` instead of `test-keys` |
| `File.exists()` | Java | Returns `false` for suspicious paths (`/system/bin/su`, etc.) |
| `Runtime.exec()` | Java | Blocks execution of `su`, `busybox`, `which su` |
| `RootBeer.isRooted()` | Java | Returns `false` |
| `open/access/stat` | Native (optional) | Blocks native syscalls on suspicious paths |

---

## Bypass Script (Plan B — Pure Frida)

### bypass_root.js

```javascript
function safeContains(str, needle) {
  try { return (str || "").toLowerCase().indexOf((needle||"").toLowerCase()) !== -1; } catch (_) { return false; }
}
const suspiciousPaths = [
  "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/su",
  "/system/app/Superuser.apk", "/system/app/SuperSU.apk",
  "/system/bin/.ext/.su", "/system/usr/we-need-root/",
  "/system/xbin/daemonsu", "/system/etc/init.d/99SuperSUDaemon",
  "/system/bin/busybox", "/system/xbin/busybox"
];
Java.perform(function () {
  try {
    const Build = Java.use('android.os.Build');
    Object.defineProperty(Build, 'TAGS', { get: function() { return 'release-keys'; } });
    console.log('[+] Build.TAGS -> release-keys');
  } catch (e) {}
  try {
    const RB = Java.use('com.scottyab.rootbeer.RootBeer');
    RB.isRooted.implementation = function(){ console.log('[+] RootBeer.isRooted -> false'); return false; };
  } catch (e) {}
  try {
    const File = Java.use('java.io.File');
    File.exists.implementation = function () {
      const p = this.getAbsolutePath();
      if (suspiciousPaths.indexOf(p) !== -1) { console.log('[+] File.exists bypass for', p); return false; }
      return this.exists.call(this);
    };
  } catch (e) {}
  try {
    const Runtime = Java.use('java.lang.Runtime');
    const JString = Java.use('java.lang.String');
    const StringArray = Java.use('[Ljava.lang.String;');
    function blockIfSus(x){ const s = Array.isArray(x)? x.join(' ') : (''+x); const t=s.toLowerCase().trim(); if(t.startsWith('su')||t.includes(' which su')||t.includes(' busybox')||t.includes(' su ')) return ['sh','-c','echo']; return null; }
    Runtime.exec.overload('java.lang.String').implementation = function(cmd){ const r=blockIfSus(cmd); return r? this.exec(JString.$new(r.join(' '))) : this.exec(cmd); };
    console.log('[+] Runtime.exec hooks installed');
  } catch(e) {}
  console.log('[+] Java bypass installed');
});
```

Run:

```powershell
frida -U -f owasp.mstg.uncrackable3 -l bypass_root.js
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `adb devices` shows `unauthorized` | Unplug/replug and accept the prompt on the device |
| frida-server version mismatch | Reinstall with `pip install -U frida frida-tools` and download matching server binary |
| `Failed to attach: unable to access process` | Run `adb root` first, then restart frida-server |
| App crashes on spawn | Use `--attach` after the app stabilizes instead of `--spawn` |
| Multiple PIDs returned by `pidof` | Use `frida -U -f <package>` to spawn instead of attaching by PID |
| App still detects root | Add `bypass_native.js` to hook native syscalls (`open`, `access`, `stat`) |

---

## Key Takeaways

Android root detection typically relies on a combination of Java-layer checks (Build properties, file existence, command execution) and native-layer syscalls. Frida makes it possible to intercept all of these at runtime without modifying the APK. The `--spawn` mode is the most reliable injection point as it hooks the app before any checks execute.
