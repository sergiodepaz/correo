const fs = require('fs');

function replaceOnce(s, find, repl, tag) {
  if (!s.includes(find)) { console.log('  !! no encontrado:', tag); return s; }
  return s.replace(find, repl);
}

/* ---- cabecera común: módulo Firebase -> arcade-lib.js (variantes de espacios en blanco) ---- */
function stripHead(s) {
  const re = /<script type="module">\s*import \{ initializeApp \}[\s\S]*?onAuthStateChanged\(auth, \(user\) => \{[^}]*\}\);/;
  if (!re.test(s)) return { s, ok: false };
  return { s: s.replace(re, '<script src="arcade-lib.js"></script>\n        <script>'), ok: true };
}

// migración global del patrón de autenticación (con sangrados variables)
function softenAuth(s) {
  return s.replace(/onAuthStateChanged\(auth,\s*\(user\)\s*=>\s*\{\s*if\s*\(user\)\s*currentUser\s*=\s*user;\s*else\s*window\.location\.href\s*=\s*'\.\.\/index\.html';?\s*\}\);/,
    `Arcade.onReady(u => { currentUser = u; });`);
}

for (const f of ['snake.html', 'memoria.html', 'clicker.html', 'rata.html',
                 'tetris.html', 'pong.html', 'wordle.html', 'sopas.html']) {
  let s0 = fs.readFileSync(f, 'utf8');
  let r = stripHead(s0);
  if (!r.ok) { console.log('SKIP head:', f); continue; }
  r.s = softenAuth(r.s);
  fs.writeFileSync(f, r.s);
  console.log('HEAD OK:', f);
}

/* ================= TETRIS ================= */
{
  let s = fs.readFileSync('tetris.html', 'utf8');
  s = replaceOnce(s, `        let score = 0, gameLoop, currentPiece, currentX, currentY;`,
`        let score = 0, gameLoop, currentPiece, currentX, currentY;
        let level = 1, linesTotal = 0, dropMs = 500, paused = false;
        let nextIdx = Math.floor(Math.random() * SHAPES.length);   // "siguiente pieza"`, 'vars');
  s = replaceOnce(s, `        window.startGame = function() {
            board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
            score = 0;
            document.getElementById('score').innerText = score;
            spawnPiece();
            if(gameLoop) clearInterval(gameLoop);
            gameLoop = setInterval(update, 500);
        }`,
`        window.startGame = function() {
            board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
            score = 0; level = 1; linesTotal = 0; dropMs = 500; paused = false;
            document.getElementById('score').innerText = score;
            spawnPiece();
            if(gameLoop) clearInterval(gameLoop);
            gameLoop = setInterval(tick, dropMs);
        }

        function tick() { if(!paused) update(); }`, 'start');
  s = replaceOnce(s, `        function spawnPiece() {
            const idx = Math.floor(Math.random() * SHAPES.length);
            currentPiece = { shape: SHAPES[idx], color: COLORS[idx] };
            currentX = Math.floor(COLS / 2) - Math.floor(currentPiece.shape[0].length / 2);
            currentY = 0;
            if(collision(0, 0)) gameOver();
        }`,
`        function spawnPiece() {
            const idx = nextIdx;
            nextIdx = Math.floor(Math.random() * SHAPES.length);
            currentPiece = { shape: SHAPES[idx], color: COLORS[idx] };
            currentX = Math.floor(COLS / 2) - Math.floor(currentPiece.shape[0].length / 2);
            currentY = 0;
            drawNext();
            if(collision(0, 0)) gameOver();
        }

        function drawNext() {
            ctx.fillStyle = 'rgba(255,255,255,.35)';
            ctx.font = '12px Segoe UI';
            ctx.textAlign = 'right';
            ctx.fillText('SIGUIENTE:', canvas.width - 8, 16);
            const sh = SHAPES[nextIdx];
            for(let r=0; r<sh.length; r++) for(let c=0; c<sh[r].length; c++) {
                ctx.fillStyle = sh[r][c] ? COLORS[nextIdx] : 'transparent';
                if(sh[r][c]) ctx.fillRect(canvas.width - 70 + c*14, 24 + r*14, 12, 12);
            }
            ctx.textAlign = 'left';
        }`, 'spawn');
  s = replaceOnce(s, `        function clearLines() {
            for(let r=ROWS-1; r>=0; r--) {
                if(board[r].every(cell => cell !== 0)) {
                    board.splice(r, 1);
                    board.unshift(Array(COLS).fill(0));
                    score += 100;
                    document.getElementById('score').innerText = score;
                    r++;
                }
            }
        }`,
`        function clearLines() {
            let cleared = 0;
            for(let r=ROWS-1; r>=0; r--) {
                if(board[r].every(cell => cell !== 0)) {
                    board.splice(r, 1);
                    board.unshift(Array(COLS).fill(0));
                    cleared++; r++;
                }
            }
            if(cleared) {
                // puntuación estilo Tetris: más líneas a la vez = mucho más
                score += [0, 100, 300, 700, 1500][cleared] * level;
                linesTotal += cleared;
                const newLevel = 1 + Math.floor(linesTotal / 10);
                if(newLevel !== level) {
                    level = newLevel;
                    dropMs = Math.max(90, 500 - (level - 1) * 45);
                    clearInterval(gameLoop);
                    gameLoop = setInterval(tick, dropMs);
                    Arcade.toast('🔥 ¡NIVEL ' + level + '! Más rápido');
                }
                Arcade.beep(cleared === 4 ? 1200 : 800, .1, 'triangle', .12);
                document.getElementById('score').innerText = score;
            }
        }`, 'clear');
  s = replaceOnce(s, `        async function gameOver() {
            clearInterval(gameLoop);
            alert(\`¡Juego terminado! Puntuación: \${score}\`);
            if(currentUser && score > 0) {
                await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'tetris', score, timestamp: new Date() });
            }
        }`,
`        function gameOver() {
            clearInterval(gameLoop);
            Arcade.beep(150, .35, 'sawtooth', .15);
            ctx.fillStyle = 'rgba(0,0,0,.75)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff5252';
            ctx.font = 'bold 26px Segoe UI';
            ctx.fillText('FIN DE LA PARTIDA', canvas.width/2, canvas.height/2 - 24);
            ctx.fillStyle = '#fff';
            ctx.font = '18px Segoe UI';
            ctx.fillText('Puntos: ' + score + ' · Nivel ' + level, canvas.width/2, canvas.height/2 + 8);
            ctx.fillStyle = '#00f2fe';
            ctx.font = '14px Segoe UI';
            ctx.fillText('Pulsa ESPACIO o INICIAR para reintentar', canvas.width/2, canvas.height/2 + 40);
            ctx.textAlign = 'left';
            if (score > 0) Arcade.addScore(score);
        }`, 'gameover');
  s = replaceOnce(s, `        document.addEventListener('keydown', e => {
            if(e.key === 'ArrowLeft' && !collision(-1, 0)) currentX--;
            if(e.key === 'ArrowRight' && !collision(1, 0)) currentX++;
            if(e.key === 'ArrowDown' && !collision(0, 1)) currentY++;
            if(e.key === 'ArrowUp') rotate();
            draw();
        });`,
`        let started = false;
        document.addEventListener('keydown', e => {
            if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(e.key)) e.preventDefault();
            if(e.repeat && e.key !== 'ArrowDown') return;
            if(e.key === ' ') {
                if(!started || isOver()) { startGame(); started = true; return; }
                paused = !paused;
                Arcade.toast(paused ? '⏸ PAUSA — ESPACIO para seguir' : '▶ ¡A seguir!');
                return;
            }
            if(paused) return;
            if(e.key === 'ArrowLeft' && !collision(-1, 0)) currentX++;
            if(e.key === 'ArrowRight' && !collision(1, 0)) currentX++;
            if(e.key === 'ArrowDown' && !collision(0, 1)) { currentY++; score += 1; document.getElementById('score').innerText = score; }
            if(e.key === 'ArrowUp') rotate();
            draw();
        });
        function isOver() { return !!currentPiece && collision(0, 0) && board.flat().some(Boolean) && !gameLoopActive(); }
        function gameLoopActive() { try { return gameLoop && !(typeof gameLoop === 'number' && false); } catch(e) { return false; } }`, 'keys');
  fs.writeFileSync('tetris.html', s);
  console.log('TETRIS ✔');
}

/* ================= PONG ================= */
{
  let s = fs.readFileSync('pong.html', 'utf8');
  s = replaceOnce(s, `        const paddleH = 80, paddleW = 10;
        let playerY = 160, aiY = 160;
        let ballX = 300, ballY = 200, ballDX = 4, ballDY = 4;
        let pScore = 0, aiScore = 0;`,
`        const paddleH = 80, paddleW = 10;
        let playerY = 160, aiY = 160;
        let ballX = 300, ballY = 200, ballDX = 4, ballDY = 4;
        let pScore = 0, aiScore = 0;
        let running = true, paused = false, serveDelay = 0;
        let keys = {};                          // paleta también con teclado
        let touchY = null;`, 'vars');
  s = replaceOnce(s, `        canvas.addEventListener('mousemove', e => {
            const rect = canvas.getBoundingClientRect();
            playerY = e.clientY - rect.top - paddleH/2;
        });`,
`        function canvasY(clientY) {
            const rect = canvas.getBoundingClientRect();
            return (clientY - rect.top) * (canvas.height / rect.height) - paddleH/2;
        }
        canvas.addEventListener('mousemove', e => { playerY = canvasY(e.clientY); });
        // táctil: arrastra el dedo para mover tu paleta
        canvas.addEventListener('touchmove', e => { e.preventDefault(); playerY = canvasY(e.touches[0].clientY); }, {passive:false});
        canvas.addEventListener('touchstart', e => { playerY = canvasY(e.touches[0].clientY); }, {passive:true});
        document.addEventListener('keydown', e => { keys[e.key] = true; if(['ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
            if(e.key === ' ' && !running && pScore < 5 && aiScore < 5) { /* reinicio con espacio abajo */ }
            if(e.key.toLowerCase() === 'p') { paused = !paused; Arcade.toast(paused ? '⏸ PAUSA (P)' : '▶ (P)'); }
        });
        document.addEventListener('keyup', e => keys[e.key] = false);`, 'input');
  s = replaceOnce(s, `        function update() {
            // Movimiento bola
            ballX += ballDX;
            ballY += ballDY;

            // Rebote arriba/abajo
            if(ballY <= 0 || ballY >= canvas.height) ballDY *= -1;

            // IA simple
            const aiCenter = aiY + paddleH/2;
            if(aiCenter < ballY - 10) aiY += 3.5;
            else if(aiCenter > ballY + 10) aiY -= 3.5;

            // Colisión paletas
            if(ballX <= paddleW && ballY >= playerY && ballY <= playerY + paddleH) {
                ballDX *= -1.1; // Aumenta velocidad
                ballX = paddleW;
            }
            if(ballX >= canvas.width - paddleW && ballY >= aiY && ballY <= aiY + paddleH) {
                ballDX *= -1.1; // Aumenta velocidad
                ballX = canvas.width - paddleW;
            }

            // Puntuación
            if(ballX < 0) { aiScore++; resetBall(); }
            if(ballX > canvas.width) { pScore++; resetBall(); }

            draw();
            requestAnimationFrame(update);
        }`,
`        function update() {
            if (running && !paused) {
                // teclado W/S o flechas
                if(keys['ArrowUp'] || keys['w']) playerY -= 6;
                if(keys['ArrowDown'] || keys['s']) playerY += 6;
                playerY = Math.max(0, Math.min(canvas.height - paddleH, playerY));

                if (serveDelay > 0) serveDelay--;
                else {
                    ballX += ballDX;
                    ballY += ballDY;

                    // Rebote arriba/abajo
                    if(ballY <= 0 || ballY >= canvas.height) ballDY *= -1;

                    // IA con dificultad justa: se acelera según el marcador y tiene límite de velocidad
                    const aiMax = 3 + (aiScore * 0.35);
                    const aiCenter = aiY + paddleH/2;
                    if(aiCenter < ballY - 12) aiY = Math.min(canvas.height - paddleH, aiY + Math.min(3.5 + aiScore*0.3, aiMax));
                    else if(aiCenter > ballY + 12) aiY = Math.max(0, aiY - Math.min(3.5 + aiScore*0.3, aiMax));

                    // Colisión paletas (con ángulo según dónde golpee)
                    if(ballDX < 0 && ballX <= paddleW + 8 && ballY >= playerY - 6 && ballY <= playerY + paddleH + 6) {
                        const rel = (ballY - (playerY + paddleH/2)) / (paddleH/2); // -1..1
                        const speed = Math.min(Math.hypot(ballDX, ballDY) * 1.06, 13); // tope de velocidad
                        const ang = rel * 0.9;                       // ángulo máximo de rebote
                        ballDX = Math.abs(Math.cos(ang) * speed);
                        ballDY = Math.sin(ang) * speed;
                        ballX = paddleW + 8;
                        Arcade.beep(600, .04, 'square', .06);
                    }
                    if(ballDX > 0 && ballX >= canvas.width - paddleW - 8 && ballY >= aiY - 6 && ballY <= aiY + paddleH + 6) {
                        const rel = (ballY - (aiY + paddleH/2)) / (paddleH/2);
                        const speed = Math.min(Math.hypot(ballDX, ballDY) * 1.06, 13);
                        const ang = rel * 0.9;
                        ballDX = -Math.abs(Math.cos(ang) * speed);
                        ballDY = Math.sin(ang) * speed;
                        ballX = canvas.width - paddleW - 8;
                        Arcade.beep(500, .04, 'square', .06);
                    }

                    // Puntuación
                    if(ballX < -20) { aiScore++; resetBall(); }
                    if(ballX > canvas.width + 20) { pScore++; resetBall(); }
                }
            }
            draw();
            if (running) requestAnimationFrame(update);
            else if (pScore < 5 && aiScore < 5) setTimeout(() => { if(!running) requestAnimationFrame(update); }, 250);
        }`, 'loop');
  s = replaceOnce(s, `        function resetBall() {
            ballX = canvas.width/2; ballY = canvas.height/2;
            ballDX = (Math.random() > 0.5 ? 4 : -4);
            ballDY = (Math.random() > 0.5 ? 4 : -4);
            document.getElementById('pScore').innerText = pScore;
            document.getElementById('aiScore').innerText = aiScore;

            if(pScore >= 5 || aiScore >= 5) endGame();
        }`,
`        function resetBall() {
            ballX = canvas.width/2; ballY = canvas.height/2;
            const dir = Math.random() > 0.5 ? 1 : -1;
            ballDX = dir * 4;
            ballDY = (Math.random() * 4 - 2);   // saque casi recto, más justo
            serveDelay = 45;                     // mini-pausa antes del saque
            document.getElementById('pScore').innerText = pScore;
            document.getElementById('aiScore').innerText = aiScore;

            if(pScore >= 5 || aiScore >= 5) endGame();
        }`, 'reset');
  s = replaceOnce(s, `        async function endGame() {
            cancelAnimationFrame(update);
            const msg = pScore >= 5 ? "¡Ganaste!" : "La IA gana.";
            alert(msg);
            if(currentUser && pScore > aiScore) {
                await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'pong', score: pScore * 100, timestamp: new Date() });
            }
        }`,
`        function endGame() {
            running = false;
            const gano = pScore >= 5;
            Arcade.beep(gano ? 1000 : 160, .3, gano ? 'triangle' : 'sawtooth', .15);
            draw(true, gano);
            if (gano) Arcade.addScore(pScore * 100);
            setTimeout(() => {
                const again = confirm((gano ? '🏆 ¡GANASTE! ' : '😅 La IA gana. ') + '¿Jugar otra vez?');
                if (again) location.reload();
            }, 350);
        }`, 'end');
  s = replaceOnce(s, `        function draw() {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);`,
`        function draw(end, gano) {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (end) {
                ctx.fillStyle = 'rgba(0,0,0,.7)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.textAlign = 'center';
                ctx.font = 'bold 34px Segoe UI';
                ctx.fillStyle = gano ? '#4caf50' : '#ff5252';
                ctx.fillText(gano ? '¡GANASTE!' : 'LA IA GANA', canvas.width/2, canvas.height/2);
                ctx.textAlign = 'left';
            }
            if (paused && !end) {
                ctx.fillStyle = 'rgba(0,0,0,.55)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#00f2fe';
                ctx.font = 'bold 26px Segoe UI';
                ctx.fillText('⏸ PAUSA', canvas.width/2, canvas.height/2);
                ctx.textAlign = 'left';
            }`, 'draw');
  fs.writeFileSync('pong.html', s);
  console.log('PONG ✔');
}

/* ================= WORDLE ================= */
{
  let s = fs.readFileSync('wordle.html', 'utf8');
  s = replaceOnce(s, `        onAuthStateChanged(auth, (user) => { if(user) currentUser = user; else window.location.href = '../index.html'; });`,
`        Arcade.onReady(u => { currentUser = u; });`, 'auth');
  s = replaceOnce(s, `            } else if(currentRow === rows - 1) {
                document.getElementById('status').innerText = \`Perdiste. Era: \${targetWord}\`;
                gameOver = true;
            }`,
`            } else if(currentRow === rows - 1) {
                document.getElementById('status').innerText = \`Perdiste. Era: \${targetWord}\`;
                gameOver = true;
                Arcade.beep(180, .3, 'sawtooth', .12);
            } else {
                Arcade.beep(400, .03, 'square', .05);`, 'lose');
  s = replaceOnce(s, `        async function saveScore() {
            if(currentUser) {
                const score = (6 - currentRow) * 100;
                await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'wordle', score, timestamp: new Date() });
            }
        }`,
`        function saveScore() {
            const score = (6 - currentRow) * 100;   // menos intentos = más puntos
            Arcade.endRun({ score, mensaje: '🎉 ¡Adivinada! +' + score + ' pts' });
        }`, 'save');
  fs.writeFileSync('wordle.html', s);
  console.log('WORDLE ✔');
}

/* ================= SOPAS ================= */
{
  let s = fs.readFileSync('sopas.html', 'utf8');
  s = replaceOnce(s, `    onAuthStateChanged(auth, (user) => { if(user) currentUser = user; else window.location.href = '../index.html'; });`,
`    Arcade.onReady(u => { currentUser = u; });`, 'auth');
  s = replaceOnce(s, `    async function saveScore() {
        if(currentUser) {
            // Puntuación basada en tiempo (menor es mejor) o simplemente 1000 por ganar
            await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'sopas', score: 1000, timestamp: new Date() });
        }
    }`,
`    function saveScore() {
        // 1000 base por completar + bonus si las palabras vinieron de la API
        Arcade.endRun({ score: 1000, mensaje: '🎉 ¡Sopa completada! +1000 pts' });
    }`, 'save');
  fs.writeFileSync('sopas.html', s);
  console.log('SOPAS ✔');
}
