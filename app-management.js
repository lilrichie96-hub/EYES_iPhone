'use strict';
// HAVEN app management: separate dock/iris slots, folders, ordering and native app actions.
// All data stays in the launcher's local WebView storage.
// Actual contained app icons make each folder recognizable without opening it.
// This component is shared by Home, dock, iris and the app-management panels.
window.createHavenFolderPreview = function (item) {
  const outer = document.createElement('span');
  outer.className = 'folder-preview';
  outer.setAttribute('aria-hidden', 'true');
  outer.style.setProperty('--folder-accent', item.accent || '#84c4ca');
  const grid = document.createElement('span');
  grid.className = 'folder-preview-grid';
  const shown = Array.isArray(item.preview) ? item.preview.slice(0, 4) : [];
  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('span');
    cell.className = 'folder-mini';
    const app = shown[i];
    if (i === 3 && item.count > 4) {
      cell.classList.add('folder-more');
      cell.textContent = '+' + (item.count - 3);
    } else if (app?.icon) {
      const img = document.createElement('img');
      img.src = app.icon;
      img.alt = '';
      img.decoding = 'async';
      cell.append(img);
    } else {
      cell.classList.add('folder-blank');
      cell.textContent = item.count ? '·' : '+';
    }
    grid.append(cell);
  }
  outer.append(grid);
  return outer;
};
window.createHavenAppManager = function (cfg) {
  const { $, read, save, native, toast, getApps, react, dive } = cfg;
  const DOCK_LIMIT = 5,
    IRIS_LIMIT = 4,
    FOLDER_LIMIT = 48;
  let dock = read('haven.fresh.pins', []),
    iris = read('haven.fresh.irisApps', []),
    homeSlots = read('haven.fresh.homeSlots', []),
    folders = read('haven.fresh.folders', {});
  if (!Array.isArray(dock)) dock = [];
  if (!Array.isArray(iris)) iris = [];
  if (!Array.isArray(homeSlots)) homeSlots = [];
  if (!folders || typeof folders !== 'object' || Array.isArray(folders)) folders = {};
  let activeApp = null,
    activeFolder = null,
    pickerApp = null,
    folderSearch = '',
    folderDeleteArmed = false,
    drag = null;
  let suppressClicksUntil = 0,
    shortcuts = [],
    shortcutAvailable = false,
    homeGestures = null,
    returnPanel = null;
  let folderShowAll = false,
    orbitPoints = [],
    orbitOpened = 0;
  const isFolder = (id) => typeof id === 'string' && id.startsWith('folder:') && !!folders[id];
  const appById = (id) => getApps().find((a) => a.id === id);
  function folderIcon() {
    return (
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M7 16a6 6 0 0 1 6-6h14l6 7h18a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6Z" fill="#234451" stroke="#88cbd3" stroke-width="2"/><circle cx="21" cy="34" r="5" fill="#b4e7e8"/><circle cx="42" cy="34" r="5" fill="#9ad2ef"/><circle cx="32" cy="44" r="4" fill="#d6b7ee"/></svg>'
      )
    );
  }
  function resolve(id) {
    if (isFolder(id)) {
      const folder = folders[id],
        members = folder.apps.map(appById).filter(Boolean);
      const name = folder.name || 'Folder';
      const palette = ['#80cbd1', '#b5a3e7', '#e0b17c', '#7dabe6', '#8fc9a2', '#d49bc4'];
      const hash = Array.from(id + name).reduce(
        (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
        0
      );
      return {
        id,
        name,
        icon: folderIcon(),
        folder: true,
        count: members.length,
        preview: members.slice(0, 4).map((app) => ({ id: app.id, name: app.name, icon: app.icon })),
        accent: palette[hash % palette.length]
      };
    }
    return appById(id) || null;
  }
  function clean(list, max) {
    const seen = new Set(),
      found = new Set(getApps().map((a) => a.id));
    return (Array.isArray(list) ? list : [])
      .filter((id) => {
        if (typeof id !== 'string' || seen.has(id) || !(found.has(id) || isFolder(id)))
          return false;
        seen.add(id);
        return true;
      })
      .slice(0, max);
  }
  function persist() {
    save('haven.fresh.pins', dock);
    save('haven.fresh.irisApps', iris);
    save('haven.fresh.homeSlots', homeSlots);
    save('haven.fresh.folders', folders);
    save('haven.fresh.pinnedOnce', true);
    save('haven.fresh.irisSeeded', true);
  }
  function changed() {
    persist();
    renderDock();
    renderHome();
    if (!$('drawer').hidden) renderApps();
    if (!$('organizeSheet').hidden) renderOrganizer();
    if (activeFolder) renderFolder();
  }
  function onAppsChanged() {
    if (!getApps().length) return;
    if (!read('haven.fresh.pinnedOnce', false)) {
      dock = [];
      for (const pattern of [
        /phone|dialer/i,
        /messages|messaging/i,
        /camera/i,
        /chrome|firefox|browser/i,
        /maps|navigation/i
      ]) {
        const app = getApps().find(
          (a) => pattern.test(a.name + ' ' + a.package) && !dock.includes(a.id)
        );
        if (app) dock.push(app.id);
      }
    }
    dock = clean(dock, DOCK_LIMIT);
    if (!read('haven.fresh.irisSeeded', false)) iris = dock.slice(0, IRIS_LIMIT);
    iris = clean(iris, IRIS_LIMIT);
    for (const [id, folder] of Object.entries(folders)) {
      if (!id.startsWith('folder:') || !folder || !Array.isArray(folder.apps)) {
        delete folders[id];
        continue;
      }
      folder.name = String(folder.name || 'Folder').slice(0, 36);
      folder.apps = [...new Set(folder.apps.filter((app) => appById(app)))].slice(0, FOLDER_LIMIT);
    }
    const usedSlots = new Set(),
      usedHomeApps = new Set();
    homeSlots = (Array.isArray(homeSlots) ? homeSlots : []).filter((entry) => {
      if (
        !entry ||
        typeof entry.id !== 'string' ||
        !Number.isInteger(entry.slot) ||
        entry.slot < 0 ||
        entry.slot >= 12
      )
        return false;
      if (usedSlots.has(entry.slot) || usedHomeApps.has(entry.id) || !resolve(entry.id))
        return false;
      usedSlots.add(entry.slot);
      usedHomeApps.add(entry.id);
      return true;
    });
    changed();
  }
  function makeFolder(name = 'New folder', initial = []) {
    const id = 'folder:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    folders[id] = { name: name.slice(0, 36), apps: [...new Set(initial)].slice(0, FOLDER_LIMIT) };
    return id;
  }
  function setList(place, items) {
    if (place === 'dock') dock = clean(items, DOCK_LIMIT);
    else iris = clean(items, IRIS_LIMIT);
    changed();
  }
  function list(place) {
    return place === 'dock' ? dock : iris;
  }
  function removeSlot(place, id) {
    setList(
      place,
      list(place).filter((x) => x !== id)
    );
  }
  function moveSlot(place, id, to) {
    const from = list(place).indexOf(id),
      items = list(place).slice();
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    items.splice(from, 1);
    items.splice(to, 0, id);
    setList(place, items);
  }
  function center(event) {
    const box = event?.currentTarget?.getBoundingClientRect?.();
    if (!box) return null;
    return { x: box.left + box.width * 0.5, y: box.top + box.height * 0.5 };
  }
  function activate(item, event, point) {
    if (!item) return;
    if (item.folder) {
      openFolder(item.id, event);
      return;
    }
    if (activeFolder) closeFolder();
    const at = center(event) || point || null;
    // HAVEN leans into the app as it opens instantly, and pops back out of it when you return.
    dive?.(at);
    react?.('launch', at);
    native('launch', item.id);
  }
  function iconFor(item) {
    if (item.folder) return window.createHavenFolderPreview(item);
    const image = document.createElement('img');
    image.src = item.icon;
    image.alt = '';
    image.loading = 'lazy';
    return image;
  }
  function labelFor(item) {
    const label = document.createElement('span');
    label.textContent = item.name;
    return label;
  }

  function shortcutButton(item, place) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className =
      place === 'dock'
        ? 'dock-app' + (item.folder ? ' dock-folder' : '')
        : place === 'home'
          ? 'home-app' + (item.folder ? ' home-folder' : '')
          : 'app' +
            (dock.includes(item.id) ? ' pinned' : '') +
            (iris.includes(item.id) ? ' iris-pinned' : '');
    b.dataset.id = item.id;
    b.setAttribute(
      'aria-label',
      item.folder ? 'Open folder ' + item.name + ', ' + item.count + ' apps' : 'Open ' + item.name
    );
    b.append(iconFor(item), labelFor(item));
    b.onclick = (e) => {
      if (homeGestures?.suppressClick()) {
        e.preventDefault();
        return;
      }
      activate(item, e);
    };
    b.oncontextmenu = (e) => {
      e.preventDefault();
      if (!item.folder) openAppActions(item);
      else openFolder(item.id);
    };
    homeGestures?.bindButton(b, item, place);
    return b;
  }
  function renderHome() {
    const root = $('homeApps');
    root.replaceChildren();
    for (const { id, slot } of homeSlots) {
      const item = resolve(id);
      if (!item) continue;
      const b = shortcutButton(item, 'home');
      const point = homeGestures.slotPoint(slot);
      b.style.left = point[0] + '%';
      b.style.top = point[1] + '%';
      b.dataset.slot = String(slot);
      root.append(b);
    }
  }
  function homeIndex(id) {
    return homeSlots.findIndex((v) => v.id === id);
  }
  function firstHomeSlot() {
    return Array.from({ length: 12 }, (_, slot) => slot).find(
      (slot) => !homeSlots.some((v) => v.slot === slot)
    );
  }
  function toggleHome(id) {
    if (homeIndex(id) >= 0) {
      homeSlots = homeSlots.filter((v) => v.id !== id);
      changed();
      toast('Removed from Home');
      return;
    }
    const slot = firstHomeSlot();
    if (slot === undefined) {
      toast('Home is full. Drag an icon to a folder or remove one.');
      return;
    }
    homeSlots.push({ id, slot });
    changed();
    toast('Added to Home');
  }
  function renderDock() {
    $('dock').replaceChildren();
    $('pinSettings').replaceChildren();
    $('irisSettings').replaceChildren();
    for (const id of dock) {
      const item = resolve(id);
      if (item) {
        $('dock').append(shortcutButton(item, 'dock'));
        $('pinSettings').append(settingChip(item, 'dock'));
      }
    }
    for (const id of iris) {
      const item = resolve(id);
      if (item) $('irisSettings').append(settingChip(item, 'iris'));
    }
    if (!dock.length) {
      const b = document.createElement('button');
      b.className = 'dock-empty';
      b.textContent = 'Add your favorite apps';
      b.onclick = () => cfg.openDrawer();
      $('dock').append(b);
    }
  }
  function settingChip(item, place) {
    const b = document.createElement('button');
    b.textContent = item.name + ' ×';
    b.setAttribute('aria-label', 'Remove ' + item.name + ' from ' + place);
    b.onclick = () => removeSlot(place, item.id);
    return b;
  }
  function renderApps() {
    const q = $('search').value.trim().toLocaleLowerCase();
    const matching = getApps().filter(
      (a) => a.name.toLocaleLowerCase().includes(q) || a.package.toLocaleLowerCase().includes(q)
    );
    $('appGrid').replaceChildren(...matching.map((a) => shortcutButton(a, 'drawer')));
    $('empty').hidden = matching.length > 0;
    $('empty').textContent = getApps().length ? 'No apps found.' : 'Loading your apps…';
  }
  function suspendBacking() {
    if (returnPanel === null) returnPanel = cfg.hidePanelForOverlay?.() || null;
  }
  function restoreBacking() {
    if (!returnPanel) return;
    if (['pinSheet', 'folderPicker', 'folderSheet', 'organizeSheet'].some((id) => !$(id).hidden))
      return;
    const old = returnPanel;
    returnPanel = null;
    cfg.restorePanelAfterOverlay?.(old);
  }
  function openAppActions(item) {
    if (item.folder) {
      openFolder(item.id);
      return;
    }
    suspendBacking();
    react?.('reach');
    activeApp = item;
    shortcuts = [];
    shortcutAvailable = false;
    $('pinTitle').textContent = item.name;
    $('pinSheet').hidden = false;
    renderAppActions();
    $('appShortcutList').replaceChildren();
    $('appShortcutStatus').textContent = 'Checking app shortcuts…';
    native('getAppShortcuts', item.id);
  }
  function renderAppActions() {
    if (!activeApp) return;
    const id = activeApp.id;
    $('pinHelp').textContent =
      'Home ' +
      homeSlots.length +
      '/12 · Dock ' +
      dock.length +
      '/' +
      DOCK_LIMIT +
      ' · Iris ' +
      iris.length +
      '/' +
      IRIS_LIMIT;
    $('pinHome').textContent = homeIndex(id) >= 0 ? 'Remove from Home' : 'Add to Home';
    $('pinConfirm').textContent = dock.includes(id) ? 'Remove from dock' : 'Add to dock';
    $('pinConfirm').disabled = !dock.includes(id) && dock.length >= DOCK_LIMIT;
    $('irisConfirm').textContent = iris.includes(id) ? 'Remove from iris' : 'Add to iris';
    $('irisConfirm').disabled = !iris.includes(id) && iris.length >= IRIS_LIMIT;
  }
  function toggleApp(place) {
    if (!activeApp) return;
    const id = activeApp.id,
      items = list(place).slice();
    if (items.includes(id))
      setList(
        place,
        items.filter((x) => x !== id)
      );
    else if (items.length < (place === 'dock' ? DOCK_LIMIT : IRIS_LIMIT))
      setList(place, items.concat(id));
    else toast('That area is full. Remove a shortcut first.');
    renderAppActions();
  }
  function receivedShortcuts(data) {
    if (!activeApp || data.id !== activeApp.id) return;
    shortcuts = Array.isArray(data.items) ? data.items.slice(0, 10) : [];
    shortcutAvailable = Boolean(data.available);
    const el = $('appShortcutList');
    el.replaceChildren();
    $('appShortcutStatus').textContent = shortcuts.length
      ? 'App shortcuts'
      : shortcutAvailable
        ? 'This app has no available shortcuts.'
        : 'Shortcuts need EYES as your default Home app (where Android supports it).';
    for (const s of shortcuts) {
      const b = document.createElement('button');
      b.textContent = s.label || 'Shortcut';
      b.onclick = () => {
        native('launchAppShortcut', activeApp.id, s.id);
        closeAppActions();
      };
      el.append(b);
    }
  }
  function closeAppActions(restore = true) {
    $('pinSheet').hidden = true;
    activeApp = null;
    if (restore) restoreBacking();
  }
  function openFolderPicker() {
    if (!activeApp) return;
    pickerApp = activeApp;
    closeAppActions(false);
    $('folderPicker').hidden = false;
    renderFolderPicker();
  }
  function renderFolderPicker() {
    $('folderPickList').replaceChildren();
    for (const id of Object.keys(folders)) {
      const f = folders[id];
      const b = document.createElement('button');
      b.className = 'folder-choice';
      b.textContent = f.name + ' · ' + f.apps.length + ' apps';
      b.onclick = () => {
        if (!f.apps.includes(pickerApp.id)) {
          if (f.apps.length >= FOLDER_LIMIT) {
            toast('This folder is full.');
            return;
          }
          f.apps.push(pickerApp.id);
        }
        $('folderPicker').hidden = true;
        pickerApp = null;
        changed();
        restoreBacking();
      };
      $('folderPickList').append(b);
    }
    $('folderPickEmpty').hidden = Object.keys(folders).length > 0;
  }
  function createFolder(place, appId = null) {
    if (
      place &&
      place !== 'home' &&
      list(place).length >= (place === 'dock' ? DOCK_LIMIT : IRIS_LIMIT)
    ) {
      toast('No empty ' + place + ' slots. Remove a shortcut first.');
      return;
    }
    if (place === 'home' && firstHomeSlot() === undefined) {
      toast('No empty ' + place + ' slots. Remove a shortcut first.');
      return;
    }
    const id = makeFolder('New folder', appId ? [appId] : []);
    if (place === 'home') {
      const slot = firstHomeSlot();
      if (slot !== undefined) homeSlots.push({ id, slot });
      changed();
    } else if (place) setList(place, list(place).concat(id));
    else changed();
    $('folderPicker').hidden = true;
    pickerApp = null;
    openFolder(id);
  }
  function openFolder(id, event) {
    if (!isFolder(id)) return;
    suspendBacking();
    react?.('unfold', center(event));
    activeFolder = id;
    folderDeleteArmed = false;
    folderSearch = '';
    folderShowAll = false;
    orbitOpened = performance.now();
    $('folderSheet').hidden = false;
    $('folderChoices').hidden = true;
    $('folderEditor').hidden = true;
    $('folderSheet').classList.remove('is-editing');
    $('folderEditToggle').setAttribute('aria-expanded', 'false');
    $('folderEditToggle').textContent = 'Edit folder';
    $('folderFilter').value = '';
    renderFolder();
  }
  function closeFolder() {
    if (activeFolder) react?.('fold');
    activeFolder = null;
    closeConstellation();
    $('folderSheet').hidden = true;
    $('folderSheet').classList.remove('is-editing');
    $('folderChoices').hidden = true;
    restoreBacking();
  }
  // Seven accessible launch targets unfurl in a crescent over HAVEN.
  // The full list remains available for larger folders, editing and short screens.
  function constellationSupported() {
    return innerWidth >= 340 && innerHeight >= 620;
  }
  function refreshConstellation() {
    const layer = $('livingConstellation'),
      sheet = $('folderSheet');
    clearTimeout(closeConstellation.timer);
    layer.classList.remove('is-retracting');
    const usable =
      !!activeFolder &&
      isFolder(activeFolder) &&
      constellationSupported() &&
      folders[activeFolder].apps.some(appById);
    const showing =
      usable && !folderShowAll && !sheet.classList.contains('is-editing') && !sheet.hidden;
    sheet.classList.toggle('constellation-active', showing);
    sheet.classList.toggle('show-all', !showing);
    $('folderViewToggle').hidden = !usable;
    $('folderViewToggle').textContent = showing ? 'All apps' : 'Orbit view';
    $('folderViewToggle').setAttribute('aria-expanded', String(!showing));
    $('home').classList.toggle('folder-unfolded', showing);
    if (!showing) {
      layer.hidden = true;
      orbitPoints = [];
      layer.replaceChildren();
      return;
    }
    const folder = folders[activeFolder],
      all = folder.apps.map(appById).filter(Boolean);
    const overflow = all.length > 7,
      visible = all.slice(0, overflow ? 6 : 7);
    const total = visible.length + (overflow ? 1 : 0);
    const radius = Math.min(innerWidth * 0.365, innerHeight * 0.18, 175),
      nodes = [],
      positions = [];
    for (let i = 0; i < total; i++) {
      const angle = ((total === 1 ? -90 : -160 + (140 * i) / (total - 1)) * Math.PI) / 180;
      const x = Math.cos(angle) * radius,
        y = Math.sin(angle) * radius;
      const app = visible[i],
        b = document.createElement('button');
      positions.push({ x, y, angle, id: app?.id || 'more' });
      b.type = 'button';
      b.className = 'constellation-node';
      b.style.setProperty('--orbit-x', x.toFixed(2) + 'px');
      b.style.setProperty('--orbit-y', y.toFixed(2) + 'px');
      b.style.setProperty('--arrival-delay', i * 58 + 'ms');
      if (app) {
        b.setAttribute('aria-label', 'Open ' + app.name + ' from ' + folder.name);
        b.append(iconFor(app), labelFor(app));
        b.onclick = (e) => activate(app, e);
      } else {
        b.classList.add('constellation-more');
        b.textContent = '+' + (all.length - visible.length);
        b.setAttribute('aria-label', 'Show all ' + all.length + ' apps in ' + folder.name);
        b.onclick = () => {
          folderShowAll = true;
          refreshConstellation();
          $('folderLaunchGrid').scrollTop = 0;
        };
      }
      b.addEventListener('pointerenter', (e) =>
        react?.('inspect', { ...center(e), id: app?.id || 'more' })
      );
      nodes.push(b);
    }
    layer.replaceChildren(...nodes);
    layer.hidden = false;
    orbitPoints = positions;
  }
  function closeConstellation() {
    const layer = $('livingConstellation'),
      hadNodes = !layer.hidden && layer.childElementCount > 0;
    clearTimeout(closeConstellation.timer);
    orbitPoints = [];
    $('home').classList.remove('folder-unfolded');
    $('folderSheet').classList.remove('constellation-active', 'show-all');
    if (hadNodes && document.documentElement.dataset.motion !== 'off') {
      layer.classList.add('is-retracting');
      closeConstellation.timer = setTimeout(() => {
        layer.hidden = true;
        layer.replaceChildren();
        layer.classList.remove('is-retracting');
      }, 340);
    } else {
      layer.hidden = true;
      layer.replaceChildren();
      layer.classList.remove('is-retracting');
    }
  }

  function renderFolder() {
    if (!isFolder(activeFolder)) return;
    const f = folders[activeFolder];
    if (document.activeElement !== $('folderName')) $('folderName').value = f.name;
    $('folderDisplayName').textContent = f.name || 'Folder';
    $('folderCount').textContent = f.apps.length + ' ' + (f.apps.length === 1 ? 'app' : 'apps');
    const grid = $('folderLaunchGrid');
    grid.replaceChildren();
    for (const id of f.apps) {
      const app = appById(id);
      if (!app) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'folder-launch-app';
      b.setAttribute('aria-label', 'Open ' + app.name);
      b.append(iconFor(app), labelFor(app));
      b.onclick = (event) => activate(app, event);
      grid.append(b);
    }
    if (!grid.children.length) {
      const empty = document.createElement('p');
      empty.className = 'folder-empty-note';
      empty.textContent = 'An empty little space. Add an app to begin.';
      grid.append(empty);
    }
    $('folderEntries').replaceChildren();
    for (const id of f.apps) {
      const app = appById(id);
      if (!app) continue;
      const row = document.createElement('div');
      row.className = 'manage-row';
      row.dataset.id = id;
      row.dataset.place = 'folder';
      row.append(iconFor(app), labelFor(app));
      const go = document.createElement('button');
      go.className = 'mini-action';
      go.textContent = 'Open';
      go.onclick = () => activate(app);
      const up = document.createElement('button');
      up.className = 'mini-action';
      up.textContent = '↑';
      up.setAttribute('aria-label', 'Move ' + app.name + ' up');
      up.onclick = () => moveInFolder(id, -1);
      const down = document.createElement('button');
      down.className = 'mini-action';
      down.textContent = '↓';
      down.setAttribute('aria-label', 'Move ' + app.name + ' down');
      down.onclick = () => moveInFolder(id, 1);
      const remove = document.createElement('button');
      remove.className = 'mini-action';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + app.name + ' from folder');
      remove.onclick = () => {
        f.apps = f.apps.filter((x) => x !== id);
        changed();
      };
      const handle = document.createElement('button');
      handle.className = 'drag-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-label', 'Drag ' + app.name);
      dragHandle(handle, 'folder', id);
      row.append(go, up, down, remove, handle);
      $('folderEntries').append(row);
    }
    $('folderDelete').textContent = folderDeleteArmed ? 'Confirm delete folder' : 'Delete folder';
    if (!$('folderChoices').hidden) renderFolderChoices();
    refreshConstellation();
  }
  function moveInFolder(id, direction) {
    const f = folders[activeFolder];
    if (!f) return;
    const from = f.apps.indexOf(id),
      to = from + direction;
    if (to < 0 || to >= f.apps.length) return;
    f.apps.splice(from, 1);
    f.apps.splice(to, 0, id);
    changed();
  }
  function renderFolderChoices() {
    const f = folders[activeFolder];
    if (!f) return;
    const q = $('folderFilter').value.trim().toLowerCase(),
      grid = $('folderChoiceList');
    grid.replaceChildren();
    for (const app of getApps().filter(
      (a) => a.name.toLowerCase().includes(q) || a.package.toLowerCase().includes(q)
    )) {
      const b = document.createElement('button');
      b.className = 'folder-choice' + (f.apps.includes(app.id) ? ' selected' : '');
      b.textContent = (f.apps.includes(app.id) ? '✓ ' : '+ ') + app.name;
      b.onclick = () => {
        if (f.apps.includes(app.id)) f.apps = f.apps.filter((x) => x !== app.id);
        else if (f.apps.length < FOLDER_LIMIT) f.apps.push(app.id);
        else toast('Folder limit reached');
        changed();
        renderFolderChoices();
      };
      grid.append(b);
    }
  }
  function deleteFolder() {
    if (!activeFolder) return;
    if (!folderDeleteArmed) {
      folderDeleteArmed = true;
      renderFolder();
      return;
    }
    const id = activeFolder;
    delete folders[id];
    dock = dock.filter((x) => x !== id);
    iris = iris.filter((x) => x !== id);
    homeSlots = homeSlots.filter((v) => v.id !== id);
    closeFolder();
    changed();
  }
  function renderOrganizer() {
    for (const place of ['dock', 'iris']) {
      const root = $(place === 'dock' ? 'organizeDock' : 'organizeIris');
      root.replaceChildren();
      for (const id of list(place)) {
        const item = resolve(id);
        if (!item) continue;
        const row = document.createElement('div');
        row.className = 'manage-row';
        row.dataset.place = place;
        row.dataset.id = id;
        row.append(iconFor(item), labelFor(item));
        const open = document.createElement('button');
        open.className = 'mini-action';
        open.textContent = item.folder ? 'Edit' : 'Info';
        open.onclick = () => (item.folder ? openFolder(id) : openAppActions(item));
        const before = document.createElement('button');
        before.className = 'mini-action';
        before.textContent = '←';
        before.setAttribute('aria-label', 'Move ' + item.name + ' left');
        before.onclick = () => moveSlot(place, id, list(place).indexOf(id) - 1);
        const after = document.createElement('button');
        after.className = 'mini-action';
        after.textContent = '→';
        after.setAttribute('aria-label', 'Move ' + item.name + ' right');
        after.onclick = () => moveSlot(place, id, list(place).indexOf(id) + 1);
        const remove = document.createElement('button');
        remove.className = 'mini-action';
        remove.textContent = '×';
        remove.setAttribute('aria-label', 'Remove ' + item.name + ' from ' + place);
        remove.onclick = () => removeSlot(place, id);
        const handle = document.createElement('button');
        handle.className = 'drag-handle';
        handle.textContent = '⠿';
        handle.setAttribute('aria-label', 'Drag ' + item.name);
        dragHandle(handle, place, id);
        row.append(open, before, after, remove, handle);
        root.append(row);
      }
    }
    $('organizeHomeCount').textContent = homeSlots.length + '/12';
    $('organizeHome').replaceChildren(
      ...homeSlots.map(({ id, slot }) => {
        const item = resolve(id),
          b = document.createElement('button');
        b.className = 'folder-choice';
        b.textContent = (item?.name || 'Unknown') + ' · Slot ' + (slot + 1) + ' ×';
        b.onclick = () => {
          homeSlots = homeSlots.filter((v) => v.id !== id);
          changed();
        };
        return b;
      })
    );
    $('organizeDockCount').textContent = dock.length + '/' + DOCK_LIMIT;
    $('organizeIrisCount').textContent = iris.length + '/' + IRIS_LIMIT;
  }
  function openOrganizer() {
    suspendBacking();
    react?.('reach');
    $('organizeSheet').hidden = false;
    renderOrganizer();
  }
  function dragHandle(handle, place, id) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { kind: 'handle', place, id, pointer: e.pointerId, el: handle, hover: null };
      handle.setPointerCapture?.(e.pointerId);
      handle.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (drag?.kind === 'handle' && drag.pointer === e.pointerId) dragMove(e);
    });
    handle.addEventListener('pointerup', (e) => {
      if (drag?.kind === 'handle') endDrag(e);
    });
    handle.addEventListener('pointercancel', (e) => {
      if (drag?.kind === 'handle') endDrag(e);
    });
  }
  function beginDockDrag(el, id, pointer) {
    drag = { kind: 'dock', place: 'dock', id, pointer, el, hover: null };
    el.classList.add('dragging');
    try {
      el.setPointerCapture(pointer);
    } catch {}
  }
  function dragMove(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest(drag.kind === 'dock' ? '.dock-app' : '.manage-row');
    if (target?.dataset.place && target.dataset.place !== drag.place) return;
    const id = target?.dataset.id;
    const entries = drag.place === 'folder' ? folders[activeFolder]?.apps || [] : list(drag.place);
    if (!id || id === drag.id || !entries.includes(id)) return;
    drag.hover = id;
    document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
    target.classList.add('drop-target');
  }
  function endDrag(event) {
    if (!drag) return;
    const current = drag;
    drag = null;
    current.el.classList.remove('dragging');
    try {
      current.el.releasePointerCapture?.(current.pointer);
    } catch {}
    document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
    suppressClicksUntil = performance.now() + 500;
    if (!current.hover) return;
    if (current.kind === 'dock') {
      const target = current.hover;
      if (isFolder(target) && !isFolder(current.id)) {
        const f = folders[target];
        if (f.apps.length >= FOLDER_LIMIT) {
          toast('This folder is full.');
          return;
        }
        if (!f.apps.includes(current.id)) f.apps.push(current.id);
        dock = dock.filter((x) => x !== current.id);
        changed();
      } else if (!isFolder(current.id) && !isFolder(target)) {
        // The familiar launcher gesture: drag one dock app onto another to make a folder.
        const id = makeFolder('Folder', [target, current.id]);
        dock = dock.filter((x) => x !== current.id).map((x) => (x === target ? id : x));
        changed();
        openFolder(id);
      } else moveSlot('dock', current.id, dock.indexOf(target));
    } else if (current.kind === 'handle') {
      if (current.place === 'folder') {
        const f = folders[activeFolder];
        if (!f) return;
        const from = f.apps.indexOf(current.id),
          to = f.apps.indexOf(current.hover);
        if (from < 0 || to < 0) return;
        f.apps.splice(from, 1);
        f.apps.splice(to, 0, current.id);
        changed();
      } else moveSlot(current.place, current.id, list(current.place).indexOf(current.hover));
    }
  }
  function back() {
    if (!$('folderPicker').hidden) {
      $('folderPicker').hidden = true;
      pickerApp = null;
      restoreBacking();
      return true;
    }
    if (!$('pinSheet').hidden) {
      closeAppActions();
      return true;
    }
    if (!$('folderSheet').hidden) {
      if (!$('folderChoices').hidden) {
        $('folderChoices').hidden = true;
        return true;
      }
      closeFolder();
      return true;
    }
    if (!$('organizeSheet').hidden) {
      $('organizeSheet').hidden = true;
      restoreBacking();
      return true;
    }
    return false;
  }
  function closeAll() {
    $('pinSheet').hidden = true;
    $('folderPicker').hidden = true;
    $('folderSheet').hidden = true;
    $('organizeSheet').hidden = true;
    activeApp = null;
    activeFolder = null;
    pickerApp = null;
    drag = null;
    returnPanel = null;
    closeConstellation();
    homeGestures?.cancel();
  }
  function bind() {
    $('pinConfirm').onclick = () => toggleApp('dock');
    $('pinHome').onclick = () => {
      if (activeApp) {
        const wasOnHome = homeIndex(activeApp.id) >= 0;
        toggleHome(activeApp.id);
        if (!wasOnHome) {
          closeAppActions();
          cfg.hideDrawerForDrag();
        } else renderAppActions();
      }
    };
    $('irisConfirm').onclick = () => toggleApp('iris');
    $('pinCancel').onclick = closeAppActions;
    $('pinFolder').onclick = openFolderPicker;
    $('pinInfo').onclick = () => {
      if (activeApp) {
        native('appInfo', activeApp.id);
        closeAppActions();
      }
    };
    $('pinUninstall').onclick = () => {
      if (activeApp) {
        native('uninstallApp', activeApp.id);
        closeAppActions();
      }
    };
    $('dockManage').onclick = $('irisManage').onclick = openOrganizer;
    $('organizeClose').onclick = () => {
      $('organizeSheet').hidden = true;
      restoreBacking();
    };
    $('organizeAddDock').onclick = () => createFolder('dock');
    $('organizeAddHome').onclick = () => createFolder('home');
    $('organizeAddIris').onclick = () => createFolder('iris');
    $('folderPickClose').onclick = () => {
      $('folderPicker').hidden = true;
      pickerApp = null;
      restoreBacking();
    };
    $('folderPickNew').onclick = () => {
      if (!pickerApp) return;
      const place =
        firstHomeSlot() !== undefined
          ? 'home'
          : dock.length < DOCK_LIMIT
            ? 'dock'
            : iris.length < IRIS_LIMIT
              ? 'iris'
              : null;
      if (!place) {
        toast('Make room on Home, dock, or iris for a new folder.');
        return;
      }
      createFolder(place, pickerApp.id);
    };
    $('folderClose').onclick = closeFolder;
    $('folderViewToggle').onclick = () => {
      folderShowAll = !folderShowAll;
      refreshConstellation();
    };
    $('folderEditToggle').onclick = () => {
      const show = $('folderEditor').hidden;
      $('folderEditor').hidden = !show;
      $('folderSheet').classList.toggle('is-editing', show);
      $('folderEditToggle').setAttribute('aria-expanded', String(show));
      $('folderEditToggle').textContent = show ? 'Done editing' : 'Edit folder';
      if (show) renderFolder();
      else refreshConstellation();
    };
    $('folderName').oninput = (e) => {
      const f = folders[activeFolder];
      if (f) {
        f.name = e.target.value.slice(0, 36);
        $('folderDisplayName').textContent = f.name || 'Folder';
        persist();
        renderDock();
        renderHome();
        if (!$('organizeSheet').hidden) renderOrganizer();
      }
    };
    $('folderAdd').onclick = () => {
      $('folderChoices').hidden = !$('folderChoices').hidden;
      if (!$('folderChoices').hidden) renderFolderChoices();
    };
    $('folderFilter').oninput = renderFolderChoices;
    $('folderDelete').onclick = deleteFolder;
    $('folderPicker').addEventListener('click', (e) => {
      if (e.target === $('folderPicker')) {
        $('folderPicker').hidden = true;
        restoreBacking();
      }
    });
  }
  homeGestures = window.createHavenHomeGestures({
    $,
    toast,
    resolve,
    openAppActions,
    openFolder,
    changed,
    makeFolder,
    getHome: () => homeSlots.map((v) => ({ ...v })),
    setHome: (entries) => {
      homeSlots = entries;
      changed();
    },
    getDock: () => [...dock],
    setDock: (entries) => {
      dock = entries;
      changed();
    },
    folderFor: (id) => folders[id],
    react,
    hideDrawer: () => cfg.hideDrawerForDrag(),
    openActions: openAppActions
  });
  bind();
  return {
    onAppsChanged,
    renderDock,
    renderApps,
    openAppActions,
    activate,
    irisItems: () => iris.map(resolve).filter(Boolean),
    back,
    closeAll,
    receivedShortcuts,
    openOrganizer,
    resolve,
    dragActive: () => homeGestures?.dragActive() || false,
    cancelDrag: () => homeGestures?.cancel(),
    constellation: () =>
      orbitPoints.length
        ? { points: orbitPoints.map((p) => ({ ...p })), openedAt: orbitOpened }
        : null,
    resizeConstellation: () => {
      if (activeFolder) refreshConstellation();
    },
    overlayOpen: () =>
      !$('pinSheet').hidden ||
      !$('folderPicker').hidden ||
      !$('folderSheet').hidden ||
      !$('organizeSheet').hidden,
    diagnostics: () => ({
      pins: [...dock],
      irisApps: [...iris],
      homeSlots: homeSlots.map((v) => ({ ...v })),
      folders: JSON.parse(JSON.stringify(folders))
    })
  };
};
