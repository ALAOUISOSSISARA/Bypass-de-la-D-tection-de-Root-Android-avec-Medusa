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
  try { const Build = Java.use('android.os.Build'); Object.defineProperty(Build, 'TAGS', { get: function() { return 'release-keys'; } }); console.log('[+] Build.TAGS -> release-keys'); } catch (e) {}
  try { const RB = Java.use('com.scottyab.rootbeer.RootBeer'); RB.isRooted.implementation = function(){ console.log('[+] RootBeer.isRooted -> false'); return false; }; if (RB.isRootedWithBusyBoxCheck) RB.isRootedWithBusyBoxCheck.implementation = function(){ console.log('[+] RootBeer.isRootedWithBusyBoxCheck -> false'); return false; }; } catch (e) {}
  try { const File = Java.use('java.io.File'); File.exists.implementation = function () { const p = this.getAbsolutePath(); if (suspiciousPaths.indexOf(p) !== -1) { console.log('[+] File.exists bypass for', p); return false; } return this.exists.call(this); }; } catch (e) {}
  try {
    const Runtime = Java.use('java.lang.Runtime'); const JString = Java.use('java.lang.String'); const StringArray = Java.use('[Ljava.lang.String;');
    function blockIfSus(x){ const s = Array.isArray(x)? x.join(' ') : (''+x); const t=s.toLowerCase().trim(); if(t.startsWith('su')||t.includes(' which su')||t.includes(' busybox')||t.includes(' su ')) return ['sh','-c','echo']; return null; }
    Runtime.exec.overload('java.lang.String').implementation = function(cmd){ const r=blockIfSus(cmd); return r? this.exec(JString.$new(r.join(' '))) : this.exec(cmd); };
    Runtime.exec.overload('[Ljava.lang.String;').implementation = function(arr){ const js = arr? Array.from(arr):[]; const r=blockIfSus(js); if(r){ const a=StringArray.$new(r.length); for(let i=0;i<r.length;i++) a[i]=JString.$new(r[i]); return this.exec(a);} return this.exec(arr); };
    Runtime.exec.overload('java.lang.String','[Ljava.lang.String;').implementation = function(cmd,env){ const r=blockIfSus(cmd); return r? this.exec(JString.$new(r.join(' ')),env): this.exec(cmd,env); };
    Runtime.exec.overload('[Ljava.lang.String;','[Ljava.lang.String;').implementation = function(arr,env){ const js=arr?Array.from(arr):[]; const r=blockIfSus(js); if(r){ const a=StringArray.$new(r.length); for(let i=0;i<r.length;i++) a[i]=JString.$new(r[i]); return this.exec(a,env);} return this.exec(arr,env); };
    console.log('[+] Runtime.exec hooks installed');
  } catch(e) {}
  console.log('[+] Java bypass installed');
});
