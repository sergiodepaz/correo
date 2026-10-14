const fs = require('fs');

// ---------- 1) Migrar juegos "antiguos" (módulos con redirect duro) a arcade-lib.js ----------
const MOD_HEAD = `<script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
        import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
        import { getFirestore, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

        const firebaseConfig = { apiKey: "AIzaSyBmTBMyE7Y_LgSXH1SrmEv29DLYdxkyUEw", authDomain: "compartir-textos-app.firebaseapp.com", projectId: "compartir-textos-app", storageBucket: "compartir-textos-app.firebasestorage.app", messagingSenderId: "705083380628", appId: "1:705083380628:web:ce267570e09e3ef1b27581" };
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        let currentUser = null;
        onAuthStateChanged(auth, (user) => { if(user) currentUser = user; else window.location.href = '../index.html'; });`;

const MOD_HEAD2 = MOD_HEAD.replace('\n\n        let currentUser', '\n        let currentUser'); // variante sin línea en blanco

function replaceOnce(s, find, repl, tag) {
  if (!s.includes(find)) { console.log('  !! no encontrado:', tag); return s; }
  return s.replace(find, repl);
}

let migrated = [];
for (const f of ['snake.html', 'memoria.html', 'clicker.html', 'rata.html']) {
  let s = fs.readFileSync(f, 'utf8');
  let head = null;
  if (s.includes(MOD_HEAD)) head = MOD_HEAD;
  else if (s.includes(MOD_HEAD2)) head = MOD_HEAD2;
  if (!head) { console.log('SKIP head:', f); continue; }
  s = s.replace(head, '<script src="arcade-lib.js"></script>\n    <script>');
  migrated.push(f);
  fs.writeFileSync(f, s);
  console.log('HEAD OK:', f);
}

/* ================= SNAKE ================= */
{
  let s = fs.readFileSync('snake.html', 'utf8');
  s = replaceOnce(s, `        let isPlaying = false;`,
`        let isPlaying = false;
        let dirQueue = [];                 // cola de giros: responde rápido y evita el "auto-choque"
        let speedMs = 110;                 // velocidad inicial (baja al comer)
        let lastKey = '';                  // anti-rebote: ignora teclas repetidas
        let paused = false;`, 'vars');
  s = replaceOnce(s, `        window.startGame = function() {
            snake = [{x: 10, y: 10}];
            dx = 1; dy = 0;
            score = 0;
            document.getElementById('score').innerText = score;
            placeFood();
            if(gameInterval) clearInterval(gameInterval);
            isPlaying = true;
            gameInterval = setInterval(update, 100);
        }`,
`        window.startGame = function() {
            snake = [{x: 10, y: 10}];
            dx = 1; dy = 0;
            dirQueue = [];
            score = 0; speedMs = 110; paused = false;
            document.getElementById('score').innerText = score;
            placeFood();
            if(gameInterval) clearInterval(gameInterval);
            isPlaying = true;
            gameInterval = setInterval(tick, speedMs);
            draw();
        }

        function tick() {
            if(paused || !isPlaying) return;
            update();
        }`, 'start');
  s = replaceOnce(s, `            snake.unshift(head);
            if(head.x === food.x && head.y === food.y) {
                score += 10;
                document.getElementById('score').innerText = score;
                placeFood();
            } else {
                snake.pop();
            }
            draw();`,
`            snake.unshift(head);
            if(head.x === food.x && head.y === food.y) {
                score += 10;
                document.getElementById('score').innerText = score;
                placeFood();
                // cada 5 manzanas la serpiente acelera un poco (¡más emoción!)
                if(score % 50 === 0 && speedMs > 60) {
                    speedMs -= 8;
                    clearInterval(gameInterval);
                    gameInterval = setInterval(tick, speedMs);
                }
            } else {
                snake.pop();
            }
            draw();`, 'speed');
  s = replaceOnce(s, `        function placeFood() {
            food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
        }`,
`        function placeFood() {
            // la comida nunca aparece encima de la serpiente
            do {
                food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
            } while (snake.some(s => s.x === food.x && s.y === food.y));
        }`, 'food');
  s = replaceOnce(s, `        async function gameOver() {
            isPlaying = false;
            clearInterval(gameInterval);
            alert(\`¡Juego terminado! Puntuación: \${score}\`);
            if(currentUser && score > 0) {
                await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'snake', score, timestamp: new Date() });
            }
        }`,
`        function gameOver() {
            isPlaying = false;
            clearInterval(gameInterval);
            Arcade.beep(160, .3, 'sawtooth', .15);
            ctx.fillStyle = 'rgba(15,12,41,.78)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff5252';
            ctx.font = 'bold 30px Segoe UI';
            ctx.fillText('💀 ¡FIN!', canvas.width/2, canvas.height/2 - 40);
            ctx.fillStyle = '#fff';
            ctx.font = '20px Segoe UI';
            ctx.fillText('Puntuación: ' + score, canvas.width/2, canvas.height/2);
            ctx.fillStyle = '#00f2fe';
            ctx.font = '15px Segoe UI';
            ctx.fillText('Pulsa ESPACIO o toca para reintentar', canvas.width/2, canvas.height/2 + 34);
            if (score > 0) Arcade.addScore(score);   // récord local inmediato + sincroniza con la nube
        }`, 'gameover');
  s = replaceOnce(s, `        document.addEventListener('keydown', e => {
            if(e.key === 'ArrowUp' && dy !== 1) { dx=0; dy=-1; }
            if(e.key === 'ArrowDown' && dy !== -1) { dx=0; dy=1; }
            if(e.key === 'ArrowLeft' && dx !== 1) { dx=-1; dy=0; }
            if(e.key === 'ArrowRight' && dx !== -1) { dx=1; dy=0; }
        });`,
`        function setDir(kx, ky) {
            const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : {x: dx, y: dy};
            if ((kx === -last.x && ky === -last.y) || (kx === last.x && ky === last.y)) return; // no dar media vuelta
            if (dirQueue.length < 3) dirQueue.push({x: kx, y: ky});
        }

        document.addEventListener('keydown', e => {
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
            if (e.repeat) return;
            if (e.key === ' ') {
                if (!isPlaying) { startGame(); return; }
                paused = !paused;
                Arcade.toast(paused ? '⏸ PAUSA — pulsa ESPACIO para seguir' : '▶ ¡Sigue así!');
                return;
            }
            if(e.key === 'ArrowUp')    setDir(0,-1);
            if(e.key === 'ArrowDown')   setDir(0,1);
            if(e.key === 'ArrowLeft')   setDir(-1,0);
            if(e.key === 'ArrowRight')  setDir(1,0);
        });`, 'keys');
  // consumir la cola de dirección dentro de update()
  s = replaceOnce(s, `        function update() {
            if(!isPlaying) return;
            const head = {x: snake[0].x + dx, y: snake[0].y + dy};`,
`        function update() {
            if(!isPlaying) return;
            if(dirQueue.length) { const d = dirQueue.shift(); dx = d.x; dy = d.y; }
            const head = {x: snake[0].x + dx, y: snake[0].y + dy};`, 'queue');
  // controles táctiles (deslizar) + toque para reintentar
  s = replaceOnce(s, `        document.addEventListener('keydown', e => {`,
`        // --- soporte táctil: deslizar sobre el canvas ---
        let touchStart = null;
        canvas.addEventListener('touchstart', e => { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, {passive:true});
        canvas.addEventListener('touchend', e => {
            if (!touchStart) return;
            const t = e.changedTouches[0];
            const vx = t.clientX - touchStart.x, vy = t.clientY - touchStart.y;
            touchStart = null;
            if (!isPlaying) { startGame(); return; }
            if (Math.abs(vx) < 18 && Math.abs(vy) < 18) return;
            if (Math.abs(vx) > Math.abs(vy)) setDir(vx > 0 ? 1 : -1, 0);
            else setDir(0, vy > 0 ? 1 : -1);
        }, {passive:true});
        canvas.addEventListener('click', () => { if (!isPlaying) startGame(); });

        document.addEventListener('keydown', e => {`, 'touch');
  fs.writeFileSync('snake.html', s);
  console.log('SNAKE ✔');
}

/* ================= MEMORIA ================= */
{
  let s = fs.readFileSync('memoria.html', 'utf8');
  s = replaceOnce(s, `        async function endGame() {
            clearInterval(interval);
            alert(\`¡Ganaste en \${timer}s con \${moves} movimientos!\`);
            if(currentUser) {
                // Score inverso: menos tiempo y movimientos = mejor puntuación
                const score = Math.max(1000 - (timer * 2) - (moves * 5), 10);
                await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'memoria', score, timestamp: new Date() });
            }
        }`,
`        function endGame() {
            clearInterval(interval);
            Arcade.beep(880,.1,'triangle',.15); setTimeout(()=>Arcade.beep(1100,.1,'triangle',.15),110); setTimeout(()=>Arcade.beep(1500,.2,'triangle',.15),220);
            // Score inverso: menos tiempo y movimientos = mejor puntuación
            const score = Math.max(1000 - (timer * 2) - (moves * 5), 10);
            Arcade.endRun({ score, mensaje: \`🎉 ¡Completado! \${timer}s · \${moves} movs → \${score} pts\` });
        }`, 'end');
  fs.writeFileSync('memoria.html', s);
  console.log('MEMORIA ✔');
}

/* ================= CLICKER ================= */
{
  let s = fs.readFileSync('clicker.html', 'utf8');
  s = replaceOnce(s, `        let coins = 0;`,
`        let coins = +(localStorage.getItem('clicker_coins') || 0);   // tu partida se conserva al volver`, 'load');
  s = replaceOnce(s, `        window.clickCoin = function() {
            coins++;
            updateUI();
        }`,
`        window.clickCoin = function(ev) {
            coins++;
            floatText(ev, '+1');
            Arcade.beep(500 + Math.random()*150, .03, 'square', .04);
            updateUI();
        }

        // pequeño "+1" flotante donde haces clic
        function floatText(ev, txt) {
            const el = document.createElement('div');
            el.textContent = txt;
            el.style.cssText = 'position:fixed;color:#ffd700;font-weight:800;font-size:1.3rem;pointer-events:none;z-index:999;' +
              'text-shadow:0 0 8px rgba(255,215,0,.6);transition:all .7s ease-out;left:' + (ev.clientX||innerWidth/2) + 'px;top:' + (ev.clientY||0) + 'px;opacity:1;';
            document.body.appendChild(el);
            requestAnimationFrame(() => { el.style.transform = 'translateY(-60px)'; el.style.opacity = '0'; });
            setTimeout(() => el.remove(), 750);
        }`, 'coin');
  s = replaceOnce(s, `        window.buyUpgrade = function(idx) {
            if(coins >= costs[idx]) {
                coins -= costs[idx];
                cps += cpsValues[idx];
                costs[idx] = Math.floor(costs[idx] * 1.5);
                updateUI();
            }
        }`,
`        window.buyUpgrade = function(idx) {
            if(coins >= costs[idx]) {
                coins -= costs[idx];
                cps += cpsValues[idx];
                costs[idx] = Math.floor(costs[idx] * 1.5);
                Arcade.beep(700 + idx*200, .08, 'triangle', .1);
                save();
                updateUI();
            } else {
                Arcade.beep(150, .12, 'sawtooth', .08);
                Arcade.toast('Te faltan ' + Math.ceil(costs[idx] - coins) + ' monedas 💰');
            }
        }

        function save() {
            localStorage.setItem('clicker_coins', String(Math.floor(coins)));
            localStorage.setItem('clicker_cps', String(cps));
            localStorage.setItem('clicker_costs', JSON.stringify(costs));
        }`, 'buy');
  s = replaceOnce(s, `        function updateUI() {
            document.getElementById('coins').innerText = Math.floor(coins);`,
`        // restaurar mejoras guardadas
        try {
            const sc = JSON.parse(localStorage.getItem('clicker_costs') || 'null');
            if (sc && sc.length === 3) { costs = sc; cps = +(localStorage.getItem('clicker_cps') || 0); }
        } catch(e) {}

        function updateUI() {
            document.getElementById('coins').innerText = Math.floor(coins);`, 'restore');
  s = replaceOnce(s, `        setInterval(() => {
            if(cps > 0) {
                coins += cps / 10;
                updateUI();
            }
        }, 100);

        // Guardar récord cada 30 segundos
        setInterval(async () => {
            if(currentUser && coins > 0) {
                await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'clicker', score: Math.floor(coins), timestamp: new Date() });
            }
        }, 30000);`,
`        setInterval(() => {
            if(cps > 0) {
                coins += cps / 10;
                updateUI();
            }
        }, 100);

        // Guardar progreso y récord (la librería evita duplicados en la nube)
        setInterval(() => {
            save();
            if (coins > 0) Arcade.addScore(Math.floor(coins));
        }, 15000);
        window.addEventListener('beforeunload', save);
        updateUI();`, 'save');
  fs.writeFileSync('clicker.html', s);
  console.log('CLICKER ✔');
}

/* ================= RATA ================= */
{
  let s = fs.readFileSync('rata.html', 'utf8');
  s = replaceOnce(s, `        class Rata {
            constructor() {
                this.size = 34 + Math.random() * 20;`,
`        class Rata {
            constructor(fast) {
                this.gold = Math.random() < 0.08;          // rata dorada: vale 3 puntos
                this.size = (fast ? 22 : 34) + Math.random() * (this.gold ? 14 : 20);`, 'goldsize');
  s = replaceOnce(s, `                this.vx = (Math.random() - 0.5) * 3;
                this.vy = (Math.random() - 0.5) * 3;`,
`                const mul = fast ? 2.2 : 1;
                this.vx = (Math.random() - 0.5) * 3 * mul;
                this.vy = (Math.random() - 0.5) * 3 * mul;`, 'fast');
  s = replaceOnce(s, `            draw() {
                ctx.font = \`\${this.size}px serif\`;
                ctx.fillText('🐀', this.x, this.y + this.size);
            }`,
`            draw() {
                ctx.font = \`\${this.size}px serif\`;
                ctx.fillText(this.gold ? '✨' : '🐀', this.x, this.y + this.size);
            }`, 'draw');
  s = replaceOnce(s, `            for (let i = ratas.length - 1; i >= 0; i--) {
                if (ratas[i].contains(px, py)) {
                    ratas.splice(i, 1);
                    score++;
                    document.getElementById('score').innerText = score;
                    ratas.push(new Rata());
                    break;
                }
            }`,
`            for (let i = ratas.length - 1; i >= 0; i--) {
                if (ratas[i].contains(px, py)) {
                    const g = ratas[i].gold;
                    ratas.splice(i, 1);
                    score += g ? 3 : 1;
                    document.getElementById('score').innerText = score;
                    Arcade.beep(g ? 1400 : 700, .06, 'triangle', .12);
                    // con el tiempo las ratas nuevas salen más rápidas
                    ratas.push(new Rata(timeLeft < 15));
                    break;
                }
            }`, 'hit');
  s = replaceOnce(s, `        function endGame() {
            isPlaying = false;
            clearInterval(gameInterval);
            clearInterval(timerInterval);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#667eea';
            ctx.font = 'bold 28px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('¡Fin del juego!', canvas.width / 2, canvas.height / 2 - 20);
            ctx.fillText(\`Atrapaste \${score} ratas 🐀\`, canvas.width / 2, canvas.height / 2 + 20);
            if (currentUser && score > 0) {
                addDoc(collection(db, "scores"), {
                    userId: currentUser.uid,
                    gameId: 'rata',
                    score: score,
                    timestamp: Date.now()
                }).catch(e => console.log("Error guardando récord", e));
            }
        }`,
`        function endGame() {
            isPlaying = false;
            clearInterval(gameInterval);
            clearInterval(timerInterval);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(15,12,41,.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#667eea';
            ctx.font = 'bold 28px Segoe UI';
            ctx.fillText('⏰ ¡Fin del tiempo!', canvas.width / 2, canvas.height / 2 - 30);
            ctx.fillStyle = '#fff';
            ctx.font = '20px Segoe UI';
            ctx.fillText('Puntuación: ' + score + ' 🐀', canvas.width / 2, canvas.height / 2 + 8);
            ctx.fillStyle = '#00f2fe';
            ctx.font = '15px Segoe UI';
            ctx.fillText('Pulsa INICIAR para otra ronda', canvas.width / 2, canvas.height / 2 + 42);
            if (score > 0) Arcade.addScore(score);   // récord local al instante + nube
        }`, 'end');
  fs.writeFileSync('rata.html', s);
  console.log('RATA ✔');
}

console.log('MIGRADOS:', migrated.join(', '));
