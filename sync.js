/* Đăng nhập Google + tự động sao lưu / lấy tiến độ từ Google Drive của người học.
   Dùng quyền drive.file: app chỉ thấy file do chính nó tạo, không đọc được file khác trong Drive. */
(function () {
  const CFG = window.APP_CONFIG || {};
  const FILE_NAME = "hoc-tieng-anh-tien-do.json";
  const SCOPE = "https://www.googleapis.com/auth/drive.file openid email";
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let tokenClient = null, token = null, tokenExp = 0, fileId = LS.get("hta-fileid", null);
  let email = LS.get("hta-email", null);
  let status = "local"; // local | signing | syncing | synced | offline | expired | error
  let lastSync = LS.get("hta-lastsync", 0);
  let saveTimer = null, saving = false, pendingAfter = false;
  const listeners = [];
  let api = null; // { getState, setState(merged), onRemoteApplied }

  const enabled = !!CFG.GOOGLE_CLIENT_ID;
  const emit = () => listeners.forEach(f => { try { f(info()); } catch (e) {} });
  const info = () => ({ enabled, status, email, lastSync, signedIn: !!token && Date.now() < tokenExp, dirty: LS.get("hta-dirty", false) });

  function loadGis() {
    return new Promise((res, rej) => {
      if (window.google?.accounts?.oauth2) return res();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
      s.onload = () => res(); s.onerror = () => rej(new Error("gis"));
      document.head.append(s);
    });
  }

  async function initClient() {
    if (tokenClient) return tokenClient;
    await loadGis();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: () => {} // gán lại ở mỗi lần xin token
    });
    return tokenClient;
  }

  /* Phải gọi từ một cú bấm của người dùng (trình duyệt chặn cửa sổ đăng nhập nếu không). */
  async function signIn() {
    if (!enabled) return;
    status = "signing"; emit();
    try {
      const tc = await initClient();
      const resp = await new Promise((res, rej) => {
        tc.callback = r => (r && r.access_token ? res(r) : rej(r));
        tc.error_callback = e => rej(e);
        tc.requestAccessToken({ prompt: email ? "" : "consent", login_hint: email || undefined });
      });
      token = resp.access_token;
      tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
      const me = await gfetch("https://www.googleapis.com/oauth2/v3/userinfo").then(r => r.json());
      const newEmail = (me.email || "").toLowerCase();
      if (email && newEmail && newEmail !== email) {
        // Đổi sang tài khoản khác: không trộn tiến độ của người cũ vào tài khoản mới.
        fileId = null; LS.del("hta-fileid");
        api.setState(null, { replaceLocal: true });
      }
      email = newEmail || email; LS.set("hta-email", email);
      await pull();
    } catch (e) {
      status = token ? "error" : (email ? "expired" : "local");
      emit();
      throw e;
    }
  }

  function signOut() {
    try { if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0; status = "local"; emit();
  }

  /* Đăng xuất và xoá tiến độ khỏi máy này (dữ liệu trên Drive vẫn còn). Dùng khi học trên máy chung. */
  function forget() {
    signOut();
    email = null; fileId = null;
    ["hta-email", "hta-fileid", "hta-lastsync", "hta-dirty"].forEach(LS.del);
    api.setState(null, { replaceLocal: true });
    emit();
  }

  async function gfetch(url, opts = {}) {
    if (!token || Date.now() >= tokenExp) { token = null; status = "expired"; emit(); throw new Error("expired"); }
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + token } });
    if (r.status === 401) { token = null; status = "expired"; emit(); throw new Error("expired"); }
    if (!r.ok) throw new Error("http " + r.status);
    return r;
  }

  async function findFile() {
    if (fileId) {
      try { await gfetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed`).then(r => r.json()).then(f => { if (f.trashed) throw 0; }); return fileId; }
      catch (e) { if (status === "expired") throw e; fileId = null; }
    }
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const res = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`).then(r => r.json());
    fileId = res.files && res.files[0] ? res.files[0].id : null;
    LS.set("hta-fileid", fileId);
    return fileId;
  }

  async function pull() {
    status = "syncing"; emit();
    try {
      const id = await findFile();
      let remote = null;
      if (id) remote = await gfetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`).then(r => r.json()).catch(() => null);
      api.setState(remote, { owner: email });
      await push(true);
    } catch (e) {
      if (status !== "expired") status = navigator.onLine ? "error" : "offline";
      emit();
    }
  }

  async function push(force) {
    if (!token || Date.now() >= tokenExp) { if (email) { status = "expired"; emit(); } return; }
    if (saving) { pendingAfter = true; return; }
    if (!force && !LS.get("hta-dirty", false)) return;
    saving = true; status = "syncing"; emit();
    try {
      const body = JSON.stringify({ ...api.getState(), owner: email, savedAt: Date.now() });
      if (!fileId) await findFile();
      if (fileId) {
        await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body
        });
      } else {
        const b = "hta" + Math.random().toString(36).slice(2);
        const meta = JSON.stringify({ name: FILE_NAME, mimeType: "application/json", description: "Tiến độ học của app Kế Toán Nói Tiếng Anh. Đừng xoá file này nếu bạn muốn giữ bài đã học." });
        const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
        const f = await gfetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
          method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body: multipart
        }).then(r => r.json());
        fileId = f.id; LS.set("hta-fileid", fileId);
      }
      LS.set("hta-dirty", false);
      lastSync = Date.now(); LS.set("hta-lastsync", lastSync);
      status = "synced";
    } catch (e) {
      if (status !== "expired") status = navigator.onLine ? "error" : "offline";
    } finally {
      saving = false; emit();
      if (pendingAfter) { pendingAfter = false; push(); }
    }
  }

  /* Gọi mỗi khi tiến độ thay đổi: lưu lên Drive sau vài giây (gom nhiều thay đổi vào 1 lần lưu). */
  function changed() {
    LS.set("hta-dirty", true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => push(), 4000);
    emit();
  }

  function flushNow() { clearTimeout(saveTimer); if (LS.get("hta-dirty", false)) push(); }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
  window.addEventListener("online", () => { if (token) pull(); });

  window.Sync = {
    init(a) { api = a; if (email) status = enabled ? "expired" : "local"; emit(); if (enabled) initClient().catch(() => {}); },
    onChange(f) { listeners.push(f); f(info()); },
    signIn, signOut, forget, changed, flushNow, info,
    accessToken: () => (token && Date.now() < tokenExp ? token : null)
  };
})();
