from pathlib import Path
import zipfile,hashlib,subprocess
def edit(n,a,b):
    p=Path(n);s=p.read_text();assert s.count(a)==1,(n,a[:80],s.count(a));p.write_text(s.replace(a,b,1))
z=zipfile.ZipFile('qa/living-280-shared.zip')
for n in ['eyes-living.js','personality.js']:
    Path(n).write_bytes(z.read('assets/'+n))
edit('ability-wheel.js','    state: () => machine.state,','    state: () => machine.state,\n    // 4.8: the satellite\'s screen point while it is shown (the Living Eye investigates it now and then)\n    satellite: () => (satShown && geo ? satellitePoint(geo) : null),')
edit('index.html','EYES for iPhone 2.7.0','EYES for iPhone 2.8.0')
edit('index.html','    <script src="personality.js"></script>','    <script src="personality.js"></script>\n    <script src="eyes-living.js?v=280"></script>')
edit('index.html','launcher.js?v=266','launcher.js?v=280')
edit('launcher.js','  const core = new Presence(present);','  const core = new Presence(present);\n  let living = null;   // 4.8 The Living Eye (eyes-living.js), created once personality and play exist')
edit('launcher.js','  const play = window.createEyesPlay ? createEyesPlay({ core, personality, now, schedule: () => schedule(), eyeCentre }) : null;', '''  const play = window.createEyesPlay ? createEyesPlay({ core, personality, now, schedule: () => schedule(), eyeCentre }) : null;
  // 4.8 The Living Eye: emotions, curiosity, independent play, reunions and rare moments. It lives only inside
  // draw() and steps aside at once for anything the owner is doing (or any screen that isn't the Eye).
  living = window.createEyesLiving
    ? createEyesLiving({
        core, personality, now, read, save, eyeCentre, schedule: () => schedule(),
        lowPower: () => !!(core.state.saver || core.state.battery <= 20),
        blocked() {
          if (!visibility || document.hidden) return 'hidden';
          if (window.HavenAwakening && HavenAwakening.open) return 'awakening';
          if (homeHeld) return 'scene';
          if (panel) return 'panel';
          if (window.EyesAbility && EyesAbility.state() !== 'IDLE') return 'ability';
          if (window.EyesContact && EyesContact.isOpen && EyesContact.isOpen()) return 'contact';
          if (window.EyesHangout && EyesHangout.busy && EyesHangout.busy()) return 'hangout';
          if (window.EyesDuel && EyesDuel.isOpen && EyesDuel.isOpen()) return 'duel';
          if (window.EyesPlaytime && EyesPlaytime.active && EyesPlaytime.active()) return 'play';
          if (play && play.busy()) return 'play';
          if (eyeDive.active(now())) return 'dive';
          if (!$('notice').hidden) return 'notification';
          if (folderOpen() || iris.reachOpen() || iris.busy() || iris.flinging()) return 'iris';
          if (appManager.dragActive() || pointerActive) return 'touch';
          if ($('home').classList.contains('music-focus')) return 'focus';
          if (typeof volumeIris !== 'undefined' && volumeIris && volumeIris.active(now())) return 'volume';
          return '';
        }
      })
    : null;''')
edit('launcher.js','    // Quirks: its own little habits, only while it is resting and nothing else is happening.','    // Quirks: its own little habits, only while it is resting and nothing else is happening.\n    // 4.8: its feelings and its own little sequences, on this frame\'s body (eyes-living.js)\n    if (living) living.apply(model, t, ab);')
edit('launcher.js','        paintMaterial: (c, o) => paintLivingMaterial(c, { ...o, v, music: m, lowPower }),','        paintMaterial: (c, o) => (paintLivingMaterial(c, { ...o, v, music: m, lowPower }), living && living.paintIris(c, { ...o, music: m, lowPower, tint: (intensity, alpha) => color(v, intensity, alpha) })),')
edit('launcher.js','    paintPersonality(t, cx, cy, size, v);','    paintPersonality(t, cx, cy, size, v);\n    if (living) living.paint(ctx, { t, cx, cy, size, tint: (intensity, alpha) => color(v, intensity, alpha), lowPower: core.state.saver || core.state.battery <= 20 });')
edit('launcher.js','        notifications = data.items || [];','        if (living) living.signal(\'notifications\', data);\n        notifications = data.items || [];')
edit('launcher.js','  function openPanel(id) {','  function openPanel(id) {\n    if (living) living.yieldNow(\'panel\');   // 4.8: the Living Eye lets go before the panel covers it')
edit('launcher.js','    holdHome(on) {','    holdHome(on) {\n      if (on && living) living.yieldNow(\'scene\');   // 4.8')
edit('presence.js',"    'look-around': 12, firefly: 12, stretch: 12, yawn: 12, sigh: 12, dream: 8","    'look-around': 12, firefly: 12, stretch: 12, yawn: 12, sigh: 12, dream: 8,\n    // 4.8 The Living Eye (eyes-living.js): its own idle sequences sit below every real event; its greetings sit\n    // with the greetings; being caught in the act by your touch sits just above an ordinary touch\n    living: 14, 'living-greet': 52, 'living-caught': 77")
edit('presence.js','      this.lastPetVariant = -1;','      this.lastPetVariant = -1;\n    // 4.8: how its feelings stretch or quicken the time between idle glances (eyes-living.js). 1 = unchanged.\n    this.paceK = 1;')
edit('presence.js','(dnaMotion ? dnaMotion.gazePace : 1);','(dnaMotion ? dnaMotion.gazePace : 1) * (this.paceK || 1);')
edit('sw.js','eyes-web-2.7.0-playdate','eyes-web-2.8.0-living')
edit('sw.js','"launcher.js?v=266","eye-render.js"','"launcher.js?v=280","eyes-living.js?v=280","presence.js","personality.js","haven-life.js","ability-wheel.js","eye-render.js"')
hashes={'launcher.js': '4caaa61841879a21715da31e25f271f2c55a44ce73f9267a439ad2812c6be18c', 'ability-wheel.js': '10d485bdfa68bd6e28a53b04019c1811db78536702c840d5d558dd166b3aa4a8', 'sw.js': '1a27922cbe45b4911ca579750ba0be93373bfc727cb0abb6b0309478467d42c9', 'index.html': '0c2d27e5ca676569bdd7619775dab788220f57899aefcac2dc1ecc67e610e644', 'presence.js': '2004e40d3902b03cdef373db36f99194696327651712815f492ff16fe7400f7d', 'personality.js': '107469d19114bec04abb965a76a2729f3de2df0d8df4fad7266e38bee5826733', 'eyes-living.js': 'c537149132247583d10ed5acb22f4867685dacf682a7394ca5b957950940d40f'}
for n,h in hashes.items():
    actual=hashlib.sha256(Path(n).read_bytes()).hexdigest()
    assert actual==h,(n,actual,h)
    if n.endswith('.js'):subprocess.run(['node','--check',n],check=True)
print('All seven files match exact supplied iPhone update SHA256')
