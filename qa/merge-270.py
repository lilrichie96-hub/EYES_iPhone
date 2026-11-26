from pathlib import Path
import zipfile,hashlib,subprocess
z=zipfile.ZipFile('qa/iphone-270-input.zip')
def once(s,a,b):
    assert s.count(a)==1,repr(a)
    return s.replace(a,b,1)
def edit(n,a,b):
    p=Path(n);p.write_text(once(p.read_text(),a,b))
prefix='EYES_iPhone_2.7.0_update/files/'
# Use identical shared Hangout renderer and protocol as Android, including its side-by-side layout.
for n,h in [('eyes-hangout.js','3676540e080d7519df870f2c4ab14f1f934c684c'),('eyes-hangout.css','b5f0441626625eca98218d75144657e310200410')]:
    b=z.read(prefix+n);assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==h,n;Path(n).write_bytes(b)
# iPhone's older Contact host did not support the controller geometry hook.
edit('eyes-contact.js',"else if (mode === 'meet') L = layoutPair(focusKey, !!(ctrl && ctrl.layout));","else if (mode === 'meet') L = ctrl && ctrl.pairLayout ? ctrl.pairLayout(focusKey, bounds(), W, H) : layoutPair(focusKey, !!(ctrl && ctrl.layout));")
edit('eyes-contact.js',"    const step = motion === 'gentle' || !busy ? 1 / 30 : 1 / 60;","    let calm = false; if (!busy && ctrl && ctrl.quiet) { try { calm = !!ctrl.quiet(); } catch (e) {} }\n    const step = calm ? 1 / 20 : motion === 'gentle' || !busy ? 1 / 30 : 1 / 60;")
edit('index.html','EYES for iPhone 2.6.7','EYES for iPhone 2.7.0')
for n in ['eyes-hangout.js','eyes-hangout.css','eyes-contact.js']:
    edit('index.html',('href' if n.endswith('.css') else 'src')+'="'+n+'"',('href' if n.endswith('.css') else 'src')+'="'+n+'?v=270"')
    edit('sw.js','"'+n+'"','"'+n+'?v=270"')
edit('sw.js','eyes-web-2.6.7-clean-home','eyes-web-2.7.0-playdate')
for n in ['eyes-hangout.js','eyes-contact.js','sw.js']:subprocess.run(['node','--check',n],check=True)
