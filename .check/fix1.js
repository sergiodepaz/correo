const fs = require('fs');
function rep(s, find, repl, tag) {
  if (!s.includes(find)) { console.log('!! no encontrado:', tag); return s; }
  return s.replace(find, repl);
}

/* ---------- WORDLE: arreglar reemplazo roto + auth suave ---------- */
{
  let s = fs.readFileSync('wordle.html', 'utf8');
  s = rep(s, `            } else {
                Arcade.beep(400, .03, 'square', .05); else {
                currentRow++;`,
`            } else {
                Arcade.beep(400, .03, 'square', .05);
                currentRow++;`, 'fix-else');
  s = rep(s, `        <script>\n\n        let targetWord`,
`        <script>
        let currentUser = null;
        Arcade.onReady(u => { currentUser = u; });

        let targetWord`, 'auth');
  fs.writeFileSync('wordle.html', s);
  console.log('WORDLE ✔');
}

/* ---------- SOPAS: auth suave ---------- */
{
  let s = fs.readFileSync('sopas.html', 'utf8');
  s = rep(s, `<script src="arcade-lib.js"></script>\n        <script>`,
`<script src="arcade-lib.js"></script>\n    <script>\n    let currentUser = null;\n    Arcade.onReady(u => { currentUser = u; });`, 'auth');
  fs.writeFileSync('sopas.html', s);
  console.log('SOPAS ✔');
}

/* ---------- TETRIS: niveles, siguiente pieza, limpiar líneas correctas ---------- */
{
  let s = fs.readFileSync('tetris.html', 'utf8');
  s = rep(s, `        function clearLines() {
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
  fs.writeFileSync('tetris.html', s);
  console.log('TETRIS ✔');
}

/* ---------- PONG: bucle nuevo con ángulos, teclado, táctil, pausa y saque ---------- */
{
  let s = fs.readFileSync('pong.html', 'utf8');
  s = rep(s, `        function update() {
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
                ballDX *= -1.1;
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

                    // IA con dificultad justa: se acelera según el marcador, con tope
                    const aiSpeed = Math.min(3.5 + aiScore * 0.3, 5.5);
                    const aiCenter = aiY + paddleH/2;
                    if(aiCenter < ballY - 12) aiY = Math.min(canvas.height - paddleH, aiY + aiSpeed);
                    else if(aiCenter > ballY + 12) aiY = Math.max(0, aiY - aiSpeed);

                    // Colisión paletas: ángulo según dónde golpee + tope de velocidad
                    if(ballDX < 0 && ballX <= paddleW + 8 && ballY >= playerY - 6 && ballY <= playerY + paddleH + 6) {
                        const rel = (ballY - (playerY + paddleH/2)) / (paddleH/2);
                        const speed = Math.min(Math.hypot(ballDX, ballDY) * 1.06, 13);
                        const ang = rel * 0.9;
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
        }`, 'loop');
  s = rep(s, `        function resetBall() {
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
  fs.writeFileSync('pong.html', s);
  console.log('PONG ✔');
}
