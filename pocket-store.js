/* EYES 4.4.5 · Pocket Dimension storage. Everything EYES keeps for you, on this phone only.

   IndexedDB "eyes-pocket" (v1)
     items   one record per kept thing: { id, kind, title, text, url, host, mime, size, name, nid, w, h,
             pinned, created, updated, source, hash, thumb }   (thumb = true when a thumbnail is stored)
     thumbs  { id, blob }  small JPEG thumbnails, read only for the cards on screen

   Binaries (photos, PDFs …) never live here or in localStorage: the Android side copies them into EYES'
   private files (PocketStore.java) and this store only keeps their native id (nid).
   Nothing in here is sent anywhere. Uninstalling EYES or clearing its data deletes it. */
'use strict';
(function () {
  const DB = 'eyes-pocket', VERSION = 1;
  let dbp = null;
  // the error a person can act on, never a stack trace
  function friendly(err) {
    const n = err && (err.name || '');
    if (n === 'QuotaExceededError' || /quota|space/i.test(String(err && err.message))) return Object.assign(new Error('Your phone is too low on space to keep that.'), { code: 'space' });
    if (n === 'InvalidStateError' || n === 'UnknownError') return Object.assign(new Error("EYES' pocket couldn't be opened. Try again."), { code: 'db' });
    return Object.assign(new Error((err && err.message) || "That couldn't be kept."), { code: err && err.code || 'fail' });
  }
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(friendly({ name: 'UnknownError' })); return; }
      let req;
      try { req = indexedDB.open(DB, VERSION); } catch (e) { reject(friendly(e)); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) {
          const s = db.createObjectStore('items', { keyPath: 'id' });
          s.createIndex('created', 'created');
          s.createIndex('hash', 'hash');
        }
        if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { try { db.close(); } catch {} dbp = null; };
        db.onclose = () => { dbp = null; };
        resolve(db);
      };
      req.onerror = () => { dbp = null; reject(friendly(req.error)); };
      req.onblocked = () => { dbp = null; reject(friendly({ name: 'InvalidStateError' })); };
    });
    return dbp;
  }
  // one transaction; resolves only after it has committed to disk (oncomplete), never before
  async function tx(stores, mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let t, out;
      try { t = db.transaction(stores, mode, { durability: 'strict' }); } catch (e) { try { t = db.transaction(stores, mode); } catch (e2) { reject(friendly(e2)); return; } }
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(friendly(t.error));
      t.onabort = () => reject(friendly(t.error || { name: 'AbortError', message: 'Saving was interrupted.' }));
      try { out = work(t); } catch (e) { try { t.abort(); } catch {} reject(friendly(e)); }
    });
  }
  const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const test = { failNext: 0 };       // the test suite makes a save fail on purpose to check nothing pretends
  const api = {
    open,
    async all() {
      return tx(['items'], 'readonly', (t) => {
        const box = { list: [] };
        const r = t.objectStore('items').getAll();
        r.onsuccess = () => { box.list = r.result || []; };
        return box;
      }).then((b) => b.list);
    },
    async get(id) {
      const db = await open();
      return req2p(db.transaction('items').objectStore('items').get(id));
    },
    async has(id) { return !!(await api.get(id)); },
    async findHash(hash) {
      if (!hash) return null;
      const db = await open();
      return req2p(db.transaction('items').objectStore('items').index('hash').get(hash)).then((r) => r || null);
    },
    // put an item (and its thumbnail, if given) in one committed transaction
    async put(item, thumbBlob) {
      if (test.failNext > 0) { test.failNext--; throw friendly({ name: 'QuotaExceededError' }); }
      const rec = { ...item, thumb: !!(thumbBlob || item.thumb) };
      await tx(['items', 'thumbs'], 'readwrite', (t) => {
        t.objectStore('items').put(rec);
        if (thumbBlob) t.objectStore('thumbs').put({ id: rec.id, blob: thumbBlob });
      });
      return rec;
    },
    async update(id, patch) {
      let out = null;
      await tx(['items'], 'readwrite', (t) => {
        const s = t.objectStore('items'), r = s.get(id);
        r.onsuccess = () => { if (!r.result) return; out = { ...r.result, ...patch, id, updated: Date.now() }; s.put(out); };
      });
      if (!out) throw Object.assign(new Error('That item is no longer in his pocket.'), { code: 'gone' });
      return out;
    },
    async thumb(id) {
      const db = await open();
      const r = await req2p(db.transaction('thumbs').objectStore('thumbs').get(id));
      return r ? r.blob : null;
    },
    async remove(id) { await tx(['items', 'thumbs'], 'readwrite', (t) => { t.objectStore('items').delete(id); t.objectStore('thumbs').delete(id); }); },
    async clear() { await tx(['items', 'thumbs'], 'readwrite', (t) => { t.objectStore('items').clear(); t.objectStore('thumbs').clear(); }); },
    async count() { const db = await open(); return req2p(db.transaction('items').objectStore('items').count()); },
    async estimate() {
      try { const e = await navigator.storage.estimate(); return { usage: e.usage || 0, quota: e.quota || 0 }; } catch { return { usage: 0, quota: 0 }; }
    },
    _test: test
  };
  window.EyesPocketStore = api;
})();
