/* ============================================================
   arcade-lib.js — librería común de Sergio's Arcade
   - Autenticación (Firebase) con pantalla de espera amigable
   - Récords: locales (inmediatos) + nube (Firebase) sin duplicados
   - Botón global de silencio 🔊/🔇 para todos los pitidos
   - Pausa con la tecla P en juegos con bucle de animación
   - Overlay "¡NUEVO RÉCORD!" y avisos con toast
   Uso mínimo en cada juego:
     <script src="arcade-lib.js"></script>
     <script> ... Arcade.onReady(cb); Arcade.addScore(n); Arcade.pausable(resumeFn); ... </script>
   ============================================================ */
(function () {
  'use strict';

  const FIREBASE_CFG = {
    apiKey: "AIzaSyBmTBMyE7Y_LgSXH1SrmEv29DLYdxkyUEw",
    authDomain: "compartir-textos-app.firebaseapp.com",
    projectId: "compartir-textos-app",
    storageBucket: "compartir-textos-app.firebasestorage.app",
    messagingSenderId: "705083380628",
    appId: "1:705083380628:web:ce267570e09e3ef1b27581"
  };

  // id del juego = nombre del archivo (snake.html -> "snake")
  const GAME_ID = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '') || 'juego';

  /* ---------------- utilidades localStorage ---------------- */
  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function uidNow() { return lsGet('arcade_uid', null); }
  function setUid(u) { if (u) lsSet('arcade_uid', u); }

  function recordKey(uid) { return 'rec_' + (uid || 'anon') + '_' + GAME_ID; }
  function getRecord() { return +(lsGet(recordKey(uidNow()), 0)) || 0; }
  function cloudBestCache() { return +(lsGet('cloudrec_' + GAME_ID, 0)) || 0; }
  function setCloudBest(v) { lsSet('cloudrec_' + GAME_ID, +v || 0); }

  /* ---------------- estado ---------------- */
  let user = null;                 // usuario Firebase cuando esté listo
  let fs = null;                   // firestore
  let auth = null;
  const readyCbs = [];
  let paused = false;
  let resumeFn = null;
  let saveQueue = {};              // gameId -> timeout (anti-duplicados)
  let lastSent = {};               // gameId -> última puntuación enviada a la nube

  /* ---------------- pantalla de carga / login amigable ---------------- */
  function showGate(text) {
    if (document.getElementById('arcade-gate')) {
      document.getElementById('arcade-gate-msg').textContent = text;
      return;
    }
    const gate = document.createElement('div');
    gate.id = 'arcade-gate';
    gate.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:18px;text-align:center;padding:20px;' +
      'background:linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%);color:#e8e8ff;';
    gate.innerHTML =
      '<div style="width:54px;height:54px;border-radius:50%;border:4px solid rgba(255,255,255,.15);' +
      'border-top-color:#00f2fe;animation:arc-spin 0.9s linear infinite;"></div>' +
      '<div id="arcade-gate-msg" style="font-size:1.1rem;letter-spacing:1px;">' + text + '</div>' +
      '<button id="arcade-login-btn" class="btn-neon" style="display:none;background:linear-gradient(90deg,#667eea,#764ba2);' +
      'color:#fff;border:none;padding:14px 30px;border-radius:12px;font-size:1.05rem;font-weight:700;cursor:pointer;">' +
      'Iniciar sesión con Google</button>';
    const st = document.createElement('style');
    st.textContent = '@keyframes arc-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
    document.body.appendChild(gate);
    document.getElementById('arcade-login-btn').onclick = () => doLogin();
  }
  function hideGate() {
    const g = document.getElementById('arcade-gate');
    if (g) { g.style.transition = 'opacity .4s'; g.style.opacity = '0'; setTimeout(() => g.remove(), 400); }
    readyCbs.forEach(cb => { try { cb(user); } catch (e) { console.error(e); } });
    readyCbs.length = 0;
  }

  /* ---------------- Firebase (carga diferida sólo si hay sesión) ---------------- */
  async function loadModules() {
    const [{ initializeApp }, { getAuth, onAuthStateChanged }, fb] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'),
    ]);
    const app = initializeApp(FIREBASE_CFG);
    auth = getAuth(app);
    fs = fb.getFirestore(app);
    return { fb, onAuthStateChanged };
  }

  async function init() {
    showGate('Conectando con tu arcade...');
    let mod;
    try { mod = await loadModules(); }
    catch (e) {
      showGate('Sin conexión con la nube: jugarás con récords locales.');
      const b = document.getElementById('arcade-login-btn'); if (b) b.style.display = 'none';
      setTimeout(hideGate, 1200);
      return;
    }
    const { onAuthStateChanged } = mod;
    onAuthStateChanged(auth, (u) => {
      if (u) {
        user = u;
        setUid(u.uid);
        hideGate();
        fetchCloudBest();
      } else {
        user = null;
        showGate('Inicia sesión para guardar tus récords 🏆');
        const b = document.getElementById('arcade-login-btn'); if (b) b.style.display = '';
        // deja jugar igualmente tras unos segundos (modo invitado local)
        setTimeout(() => { if (!user) hideGate(); }, 4000);
      }
    });
  }

  async function doLogin() {
    try {
      const { signInWithPopup, GoogleAuthProvider } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) { toast('No se pudo iniciar sesión: ' + e.code); }
  }

  /* ---------------- récords ---------------- */
  async function fetchCloudBest() {
    if (!user || !fs) return;
    try {
      const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const snap = await getDocs(query(collection(fs, 'scores'), where('userId', '==', user.uid), where('gameId', '==', GAME_ID)));
      let best = 0;
      snap.forEach(d => { best = Math.max(best, d.data().score || 0); });
      setCloudBest(best);
      lastSent[GAME_ID] = best;
      refreshHudRecord();
    } catch (e) {/* sin permisos/red: seguimos con lo local */}
  }

  // API pública: registrar puntos (guarda récord local al instante + nube anti-spam)
  function addScore(points) {
    points = Math.max(0, Math.floor(+points || 0));
    const prev = getRecord();
    if (points > prev) {
      lsSet(recordKey(uidNow()), points);
      refreshHudRecord();
      celebrateNewRecord(points);
    }
    syncToCloud(points);
    return points > prev;
  }

  function syncToCloud(points) {
    const best = Math.max(points, cloudBestCache());
    if (!user || !fs) return;
    if (best <= (lastSent[GAME_ID] || 0)) return;          // nada que subir
    clearTimeout(saveQueue[GAME_ID]);
    saveQueue[GAME_ID] = setTimeout(async () => {          // cola: 1 sola escritura por partida
      lastSent[GAME_ID] = best;
      try {
        const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await addDoc(collection(fs, 'scores'), { userId: user.uid, gameId: GAME_ID, score: best, timestamp: new Date() });
        setCloudBest(best);
      } catch (e) { console.log('nube no disponible', e && e.code); }
    }, 1500);
  }

  function celebrateNewRecord(points) {
    // overlay elegante "¡NUEVO RÉCORD!"
    let ov = document.getElementById('arc-record');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'arc-record';
      ov.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%) scale(.6);z-index:9997;' +
        'padding:14px 34px;border-radius:16px;font-weight:800;font-size:1.3rem;letter-spacing:2px;color:#fff;' +
        'background:linear-gradient(90deg,#667eea,#00f2fe);box-shadow:0 0 40px rgba(0,242,254,.5);' +
        'opacity:0;pointer-events:none;transition:all .35s cubic-bezier(.2,1.6,.4,1);';
      document.body.appendChild(ov);
    }
    ov.textContent = '🏆 ¡NUEVO RÉCORD! ' + points.toLocaleString();
    ov.style.opacity = '1'; ov.style.transform = 'translateX(-50%) scale(1)';
    clearTimeout(ov._h);
    ov._h = setTimeout(() => { ov.style.opacity = '0'; ov.style.transform = 'translateX(-50%) scale(.8)'; }, 1800);
    beepSafe(1046, .09, 'triangle', .1); setTimeout(() => beepSafe(1318, .09, 'triangle', .1), 100);
    setTimeout(() => beepSafe(1568, .18, 'triangle', .1), 200);
  }

  // HUD: muestra el récord actual dentro de .hud si existe
  function refreshHudRecord() {
    const hud = document.querySelector('.hud');
    if (!hud) return;
    let span = hud.querySelector('.hud-record');
    if (!span) {
      span = document.createElement('span');
      span.className = 'hud-record';
      span.title = 'Tu mejor puntuación en este juego';
      hud.appendChild(span);
    }
    const rec = Math.max(getRecord(), cloudBestCache());
    span.innerHTML = 'RÉCORD<b>' + (rec > 0 ? rec.toLocaleString() : '—') + '</b>';
  }

  /* ---------------- sonido global con silencio ---------------- */
  let muted = lsGet('arcade_muted', false) === true;
  const RealAC = window.AudioContext || window.webkitAudioContext;
  if (RealAC && AudioNode.prototype.connect) {
    const realConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, opts) {
      try { if (muted && dest === this.context.destination) return dest; } catch (e) {}
      return realConnect.call(this, dest, opts);
    };
  }
  function beepSafe(f, d, type, v) {
    try {
      const ac = new RealAC();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square'; o.frequency.value = f || 440;
      g.gain.setValueAtTime(v || .08, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + (d || .08));
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + (d || .08) + .02);
    } catch (e) {}
  }
  function injectMuteButton() {
    if (document.getElementById('arcade-mute')) return;
    const btn = document.createElement('button');
    btn.id = 'arcade-mute';
    btn.setAttribute('aria-label', 'Silenciar o activar el sonido');
    btn.textContent = muted ? '🔇' : '🔊';
    btn.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:9999;width:46px;height:46px;' +
      'border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.5);' +
      'color:#fff;font-size:1.25rem;cursor:pointer;backdrop-filter:blur(6px);transition:transform .2s;';
    btn.onmouseenter = () => btn.style.transform = 'scale(1.12)';
    btn.onmouseleave = () => btn.style.transform = '';
    btn.onclick = () => {
      muted = !muted; lsSet('arcade_muted', muted);
      btn.textContent = muted ? '🔇' : '🔊';
      if (!muted) beepSafe(880, .07, 'triangle', .08);
    };
    document.body.appendChild(btn);
  }

  /* ---------------- pausa con P ---------------- */
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'p' || e.key === 'P') && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) {
      if (!resumeFn) return;
      paused = !paused;
      if (paused) { toast('⏸ PAUSA — pulsa P para continuar'); }
      else { toast('▶ ¡Vamos!'); try { resumeFn(); } catch (err) {} }
    }
  });
  window.addEventListener('blur', () => {           // auto-pausa al cambiar de pestaña
    if (resumeFn && !paused && typeof running !== 'undefined' && running === true) {
      paused = true; // el juego debe respetar la pausa vía Arcade.isPaused()
    }
  });

  /* ---------------- toast ---------------- */
  function toast(msg) {
    let t = document.getElementById('arc-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'arc-toast';
      t.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9998;' +
        'background:rgba(15,12,41,.94);border:1px solid #667eea;color:#e8e8ff;padding:10px 24px;' +
        'border-radius:30px;font-weight:700;letter-spacing:.5px;box-shadow:0 6px 24px rgba(0,0,0,.5);' +
        'pointer-events:none;opacity:0;transition:opacity .3s;max-width:90vw;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 2200);
  }

  /* ---------------- fin de partida estándar ---------------- */
  function endRun(opts) {
    opts = opts || {};
    if (opts.score !== undefined) addScore(opts.score);
    if (opts.mensaje) toast(opts.mensaje);
  }

  /* ---------------- API pública ---------------- */
  window.Arcade = {
    onReady: (cb) => { user ? cb(user) : readyCbs.push(cb); },
    getUser: () => user,
    addScore,
    getRecord,
    best: () => Math.max(getRecord(), cloudBestCache()),
    endRun,
    pausable: (resume) => { resumeFn = resume || null; },
    isPaused: () => paused,
    resumeIfPaused: () => { if (paused) { paused = false; try { resumeFn && resumeFn(); } catch (e) {} } },
    toast,
    beep: beepSafe,
    gameId: GAME_ID,
  };

  // mejoras visuales comunes al cargar el DOM
  function decorate() {
    injectMuteButton();
    refreshHudRecord();
    // botón "volver" más visible en los juegos antiguos (enlace plano)
    const back = document.querySelector('a[href="juegos.html"]');
    if (back && !back.dataset.styled) {
      back.dataset.styled = '1';
      back.style.cssText += ';padding:8px 18px;border:1px solid rgba(255,255,255,.2);border-radius:30px;';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate);
  else decorate();
  new MutationObserver(refreshHudRecord).observe(document.documentElement, { childList: true, subtree: true });

  init();
})();
