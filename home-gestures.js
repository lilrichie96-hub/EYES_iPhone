'use strict';
// HAVEN's real home-screen gestures: hold, lift, move and drop.
// Keeps the separate Dock (5), Iris (4) and Home (12) layouts independent.
window.createHavenHomeGestures = function (cfg) {
  const {
    $,
    toast,
    resolve,
    openFolder,
    changed,
    makeFolder,
    getHome,
    setHome,
    getDock,
    setDock,
    folderFor,
    hideDrawer,
    openActions,
    react
  } = cfg;
  const slots = [
    [14, 30],
    [38, 30],
    [62, 30],
    [86, 30],
    [10, 42],
    [90, 42],
    [10, 55],
    [90, 55],
    [14, 68],
    [38, 68],
    [62, 68],
    [86, 68]
  ];
  const HOLD_MS = 420,
    MOVE_SLOP = 12,
    FOLDER_HOVER_MS = 520;
  let press = null,
    drag = null,
    ignoreClickUntil = 0,
    hover = null,
    hoverSince = 0,
    mergeTimer = null;
  const layer = $('homeDragLayer'),
    ghost = $('homeDragGhost'),
    targetLayer = $('homeDropTargets'),
    tip = $('homeDragTip');
  const point = (i) => slots[i] || slots[0];
  const active = () => !!drag;
  const suppressClick = () => performance.now() < ignoreClickUntil;
  const makeImage = (item) =>
    item.folder
      ? window.createHavenFolderPreview(item)
      : (() => {
          const img = document.createElement('img');
          img.src = item.icon;
          img.alt = '';
          return img;
        })();
  function indicateHeld(button) {
    if (!press || press.button !== button) return;
    press.armed = true;
    button.classList.add('press-armed');
    if (navigator.vibrate)
      try {
        navigator.vibrate(12);
      } catch {}
  }
  function bindButton(button, item, place) {
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      if (press) cancelPress();
      press = {
        button,
        item,
        place,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        armed: false,
        readyAt: performance.now(),
        timer: null
      };
      press.timer = setTimeout(() => indicateHeld(button), HOLD_MS);
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('keydown', (event) => {
      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        if (item.folder) openFolder(item.id);
        else openActions(item);
      }
    });
  }
  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press.button?.classList.remove('press-armed');
    press = null;
  }
  function cancel() {
    const wasDragging = Boolean(drag);
    cancelPress();
    clearTimeout(mergeTimer);
    mergeTimer = null;
    drag = null;
    hover = null;
    hoverSince = 0;
    if (wasDragging) react?.('release');
    layer.hidden = true;
    targetLayer.replaceChildren();
    ghost.replaceChildren();
    ghost.classList.remove('over-folder');
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    $('home').classList.remove('home-arranging');
  }
  function drawTargets() {
    targetLayer.replaceChildren();
    const screen = $('home');
    for (let i = 0; i < slots.length; i++) {
      const mark = document.createElement('div');
      mark.className = 'home-drop-target';
      mark.dataset.slot = String(i);
      mark.style.left = slots[i][0] + '%';
      mark.style.top = slots[i][1] + '%';
      targetLayer.append(mark);
    }
    screen.classList.add('home-arranging');
  }
  function startDrag(event) {
    if (!press || drag) return;
    const p = press;
    clearTimeout(p.timer);
    p.button.classList.remove('press-armed');
    drag = {
      item: p.item,
      id: p.item.id,
      source: p.place,
      pointer: p.pointer,
      startX: p.x,
      startY: p.y,
      hover: null
    };
    layer.hidden = false;
    ghost.replaceChildren(makeImage(p.item));
    const label = document.createElement('span');
    label.textContent = p.item.name;
    ghost.append(label);
    tip.textContent = 'Drop to place · Hold over another app to make a folder';
    drawTargets();
    try {
      layer.setPointerCapture(event.pointerId);
    } catch {}
    if (p.place === 'drawer') hideDrawer();
    updateDrag(event);
  }
  function dockTarget(x, y) {
    const bounds = $('dock').getBoundingClientRect();
    if (
      y < bounds.top - 28 ||
      y > bounds.bottom + 28 ||
      x < bounds.left - 22 ||
      x > bounds.right + 22
    )
      return null;
    const buttons = [...$('dock').querySelectorAll('.dock-app')];
    if (!buttons.length) return { zone: 'dock', id: null, index: 0 };
    let nearest = null,
      dist = Infinity;
    for (let i = 0; i < buttons.length; i++) {
      const r = buttons[i].getBoundingClientRect(),
        d = Math.abs(x - (r.left + r.width / 2));
      if (d < dist) {
        dist = d;
        nearest = {
          zone: 'dock',
          id: buttons[i].dataset.id,
          index: i,
          after: x > r.left + r.width / 2
        };
      }
    }
    return nearest;
  }
  function homeTarget(x, y) {
    const bounds = $('home').getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top + 40 || y > bounds.bottom - 145)
      return null;
    let chosen = 0,
      distance = Infinity;
    for (let i = 0; i < slots.length; i++) {
      const sx = bounds.left + (bounds.width * slots[i][0]) / 100,
        sy = bounds.top + (bounds.height * slots[i][1]) / 100;
      const d = Math.hypot(x - sx, y - sy);
      if (d < distance) {
        distance = d;
        chosen = i;
      }
    }
    // No drop directly on the living eye: the shortcut snaps to a safe outer cell.
    const current = getHome().find((v) => v.slot === chosen);
    return { zone: 'home', slot: chosen, id: current?.id || null };
  }
  function targetOf(x, y) {
    return dockTarget(x, y) || homeTarget(x, y);
  }
  function sameTarget(a, b) {
    return (
      a?.zone === b?.zone &&
      a?.slot === b?.slot &&
      a?.id === b?.id &&
      a?.index === b?.index &&
      a?.after === b?.after
    );
  }
  function updateDrag(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    react?.('follow', { x: event.clientX, y: event.clientY });
    ghost.style.left = event.clientX + 'px';
    ghost.style.top = event.clientY + 'px';
    const selected = targetOf(event.clientX, event.clientY);
    if (!sameTarget(hover, selected)) {
      clearTimeout(mergeTimer);
      mergeTimer = null;
      hover = selected;
      hoverSince = performance.now();
      if (selected?.id && selected.id !== drag.id) {
        react?.('anticipate', { x: event.clientX, y: event.clientY });
        const candidate = selected;
        if (!drag.item.folder && !resolve(selected.id)?.folder) {
          mergeTimer = setTimeout(() => {
            if (drag && sameTarget(hover, candidate)) {
              ghost.classList.add('over-folder');
              tip.textContent = 'Release to create a folder';
              react?.('merge', { x: event.clientX, y: event.clientY });
            }
          }, FOLDER_HOVER_MS);
        }
      }
    }
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    targetLayer
      .querySelectorAll('.home-drop-target')
      .forEach((el) =>
        el.classList.toggle(
          'highlighted',
          selected?.zone === 'home' && Number(el.dataset.slot) === selected.slot
        )
      );
    let id = selected?.id;
    if (id && id !== drag.id) {
      const el = (selected.zone === 'home' ? $('homeApps') : $('dock')).querySelector(
        '[data-id="' + CSS.escape(id) + '"]'
      );
      if (el) el.classList.add('drop-target');
    }
    ghost.classList.toggle(
      'over-folder',
      Boolean(
        id &&
        id !== drag.id &&
        !drag.item.folder &&
        !resolve(id)?.folder &&
        performance.now() - hoverSince >= FOLDER_HOVER_MS
      )
    );
    if (!ghost.classList.contains('over-folder'))
      tip.textContent =
        selected?.zone === 'dock'
          ? 'Dock · release to place'
          : selected?.zone === 'home'
            ? 'Home · release to place'
            : 'Move over Home or Dock';
    drag.hover = selected;
  }
  function placeHome(item, slot) {
    let home = getHome().filter((v) => v.id !== item.id);
    const occupied = home.find((v) => v.slot === slot);
    const source = getHome().find((v) => v.id === item.id);
    if (!occupied) {
      home.push({ id: item.id, slot });
      setHome(home);
      return true;
    }
    if (occupied.id === item.id) return true;
    if (resolve(occupied.id)?.folder && !item.folder) {
      const folder = folderFor(occupied.id);
      if (!folder || folder.apps.length >= 48) {
        toast('Folder is full.');
        return false;
      }
      if (!folder.apps.includes(item.id)) folder.apps.push(item.id);
      setHome(home);
      return true;
    }
    const linger = performance.now() - hoverSince >= FOLDER_HOVER_MS;
    if (linger && !item.folder && !resolve(occupied.id)?.folder) {
      const folderId = makeFolder('Folder', [occupied.id, item.id]);
      home = home.map((v) => (v.id === occupied.id ? { id: folderId, slot: v.slot } : v));
      setHome(home);
      openFolder(folderId);
      return true;
    }
    // Moving one Home icon onto another swaps them unless held there to merge.
    if (source) {
      home = home.map((v) => (v.id === occupied.id ? { id: v.id, slot: source.slot } : v));
      home.push({ id: item.id, slot });
      setHome(home);
      return true;
    }
    const vacant = slots.map((_, i) => i).find((i) => !home.some((v) => v.slot === i));
    if (vacant === undefined) {
      toast('Home is full. Hold over an icon to create a folder.');
      return false;
    }
    home.push({ id: item.id, slot: vacant });
    setHome(home);
    return true;
  }
  function placeDock(item, target) {
    let dock = getDock();
    const from = dock.indexOf(item.id);
    const to = target.id ? dock.indexOf(target.id) + (target.after ? 1 : 0) : dock.length;
    if (from >= 0 && target.id === item.id) return true;
    if (target.id && resolve(target.id)?.folder && !item.folder) {
      const folder = folderFor(target.id);
      if (!folder || folder.apps.length >= 48) {
        toast('Folder is full.');
        return false;
      }
      if (!folder.apps.includes(item.id)) folder.apps.push(item.id);
      setDock(dock.filter((x) => x !== item.id));
      return true;
    }
    const linger = performance.now() - hoverSince >= FOLDER_HOVER_MS;
    if (
      target.id &&
      target.id !== item.id &&
      linger &&
      !item.folder &&
      !resolve(target.id)?.folder
    ) {
      const folderId = makeFolder('Folder', [target.id, item.id]);
      dock = dock.filter((x) => x !== item.id).map((x) => (x === target.id ? folderId : x));
      setDock(dock);
      openFolder(folderId);
      return true;
    }
    if (from >= 0) {
      dock.splice(from, 1);
      const index = target.id ? dock.indexOf(target.id) + (target.after ? 1 : 0) : dock.length;
      dock.splice(index < 0 ? dock.length : index, 0, item.id);
      setDock(dock);
      return true;
    }
    if (dock.length >= 5) {
      toast('Dock is full. Move an icon first, or hold over one to make a folder.');
      return false;
    }
    dock.splice(to < 0 ? dock.length : to, 0, item.id);
    setDock(dock);
    return true;
  }
  function finish(event) {
    if (!drag) return;
    updateDrag(event);
    const d = drag,
      t = drag.hover;
    // A failed drop leaves the old layout intact.
    let placed = false;
    if (t) {
      placed = t.zone === 'dock' ? placeDock(d.item, t) : placeHome(d.item, t.slot);
      if (placed && d.source === 'home' && t.zone === 'dock')
        setHome(getHome().filter((v) => v.id !== d.id));
      if (placed && d.source === 'dock' && t.zone === 'home')
        setDock(getDock().filter((id) => id !== d.id));
    }
    react?.(placed ? 'place' : 'release', { x: event.clientX, y: event.clientY });
    ignoreClickUntil = performance.now() + 700;
    drag = null;
    cancel();
    $('home').classList.remove('home-arranging');
  }
  document.addEventListener(
    'pointermove',
    (event) => {
      if (!press || event.pointerId !== press.pointer) return;
      if (drag) {
        event.preventDefault();
        updateDrag(event);
        return;
      }
      const diff = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (!press.armed && diff > MOVE_SLOP) {
        cancelPress();
        return;
      }
      if (press.armed && diff > MOVE_SLOP) {
        event.preventDefault();
        startDrag(event);
      }
    },
    true
  );
  document.addEventListener(
    'pointerup',
    (event) => {
      if (!press || event.pointerId !== press.pointer) return;
      if (drag) {
        event.preventDefault();
        event.stopPropagation();
        finish(event);
        return;
      }
      if (press.armed) {
        event.preventDefault();
        event.stopPropagation();
        const item = press.item;
        ignoreClickUntil = performance.now() + 700;
        cancelPress();
        if (item.folder) openFolder(item.id);
        else openActions(item);
      } else cancelPress();
    },
    true
  );
  document.addEventListener(
    'pointercancel',
    (event) => {
      if (press?.pointer === event.pointerId) {
        cancel();
        $('home').classList.remove('home-arranging');
      }
    },
    true
  );
  window.addEventListener('blur', () => {
    cancel();
    $('home').classList.remove('home-arranging');
  });
  return { bindButton, slotPoint: point, suppressClick, dragActive: active, cancel };
};
