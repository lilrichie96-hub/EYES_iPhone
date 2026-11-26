from pathlib import Path
import zipfile, subprocess
z=zipfile.ZipFile('qa/iphone-266-input.zip')
prefix='EYES_iPhone_2.6.6_update/'
def pkg(n): return z.read(prefix+n).decode()
def src(n): return Path(n).read_text()
def put(n,s): Path(n).write_text(s)
def once(s,a,b):
    assert s.count(a)==1,repr(a[:150])
    return s.replace(a,b,1)
def segment(s,a,b): return s[s.index(a):s.index(b,s.index(a))]
for n in ['eyes-playtime.js','eyes-playtime.css']: put(n,pkg('files/'+n))
# Transfer geometry and rendering changes without replacing the 2.6.3 state machine.
n='ability-wheel.js';s=src(n);p=pkg('files/'+n)
s=once(s,segment(s,'  function layoutWheel(g)', '  function wheelU(t)'),segment(p,'  // 4.6.6: six abilities.', '  function wheelU(t)'))
s=once(s,'    layoutWheel(geo);','    wheel.layoutKey = "";\n    layoutWheel(geo);')
s=once(s,'      b.append(label);','      b.append(label);\n      it.labelEl = label;')
a="      it.button.classList.toggle('above-eye', !below);"
s=once(s,a,a+segment(p,a,'  function syncDom()')[len(a):].rsplit('    }\n  }\n',1)[0])
s=once(s,'const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;', 'const sxk = mix(1, wheel.sx || 1, Math.sin(Math.min(1, s * 1.6) * Math.PI / 2)), x = cx + Math.cos(a) * rr * sxk, y = cy + Math.sin(a) * rr;')
old=segment(s,'      wheel: { open:', '      transitions:');new=segment(p,'      wheel: { open:', '      transitions:');s=once(s,old,new)
assert 'wheelTouch' in s and 'resetInput' in s and 'outside-pass-through' in s
put(n,s)
n='ability-wheel.css';s=src(n);p=pkg('files/'+n);s+='\n'+p[p.index('/* 4.6.6: ability-wheel.js'):];put(n,s)
# Apply the staring contest and Optic changes by context, not wholesale replacement.
for n in ['eyes-play.js','eyes-social.js']:
    patch=pkg('diffs/'+n+'.diff')
    path=Path('/tmp/eyes-266.patch');path.write_text(patch)
    subprocess.run(['patch','--batch','--forward','--fuzz=0',n,str(path)],check=True)
n='launcher.js';s=src(n)
s=once(s,'if(ab.bodySx)p0.sx*=ab.bodySx;if(ab.bodySy)p0.sy*=ab.bodySy;if(ab.glow)p0.glow*=ab.glow;', 'if(ab.bodySx)p0.sx*=ab.bodySx;if(ab.bodySy)p0.sy*=ab.bodySy;if(ab.glow)p0.glow*=ab.glow;\n      if(ab.dx)p0.x+=ab.dx;if(ab.dy)p0.y+=ab.dy;if(ab.tilt)p0.tilt+=ab.tilt;')
s=once(s,'(1 + (liveAudio?.bass || 0) * 0.06),','(1 + (liveAudio?.bass || 0) * 0.06) * (ab && ab.scale ? ab.scale : 1),')
s=once(s,'pupilScale: ab ? mix(pupilScale,ab.pupil,ab.k) : pupilScale,','pupilScale: (ab ? mix(pupilScale,ab.pupil,ab.k) : pupilScale) * (ab && ab.pupilK ? ab.pupilK : 1),')
s=once(s,'insets:{top:0,bottom:0},lids,','insets:safeAreaProbe(),lids,')
p=pkg('files/launcher.js')
probe=segment(p,'  let safeProbe = null','  function goHome()')
s=once(s,'  function goHome() {',probe+'  function goHome() {')
s=once(s,'    holdHome(on) {',"""    playtime(reason) {
      if (!window.EyesAbility) return false;
      if (panel) closePanel();
      return EyesAbility.launch('play', reason || 'optic');
    },
    holdHome(on) {""")
s=once(s,'#weather,#wxPlace,#eyesDock', '#weather,#wxPlace,#eyesDock,#eyesPlaytime,#eyesPlay,#eyesContact')
assert 'lostpointercapture' in s and 'resetInput:' in s
# Old staring-contest touches must not trigger launcher swipes.
s=once(s,"      if (panel || appManager.overlayOpen() || appManager.dragActive()) return;\n      const gesture = iris.begin(e);","      if (panel || appManager.overlayOpen() || appManager.dragActive() || e.target.closest?.('#eyesPlay,#eyesPlaytime')) return;\n      const gesture = iris.begin(e);")
put(n,s)
n='index.html';s=src(n);s=once(s,'EYES for iPhone 2.6.3','EYES for iPhone 2.6.6')
s=once(s,'</head>','<link rel="stylesheet" href="eyes-playtime.css?v=266" /></head>')
s=once(s,'<script src="weather.js"></script>','<script src="weather.js"></script>\n    <script src="eyes-playtime.js?v=266"></script>')
for f in ['ability-wheel.js','launcher.js']: s=once(s,f+'?v=263',f+'?v=266')
for f in ['ability-wheel.css','eyes-play.js','eyes-social.js']: s=once(s,'href="'+f+'"' if f.endswith('.css') else 'src="'+f+'"',('href="' if f.endswith('.css') else 'src="')+f+'?v=266"')
put(n,s)
n='sw.js';s=src(n);s=once(s,'eyes-web-2.6.3-reopen','eyes-web-2.6.6-play')
for f in ['ability-wheel.js','launcher.js']: s=once(s,f+'?v=263',f+'?v=266')
s=once(s,'"ability-wheel.css"','"ability-wheel.css?v=266","eyes-playtime.js?v=266","eyes-playtime.css?v=266","eyes-play.js?v=266","eyes-social.js?v=266"')
put(n,s)
# Explicitly retain all four working web abilities and their bridge code; do not copy Android replacements.
for n in ['ability-wheel.js','launcher.js','eyes-play.js','eyes-social.js','eyes-playtime.js','sw.js']: subprocess.run(['node','--check',n],check=True)
