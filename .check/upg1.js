const fs = require('fs');

const files = ['snake.html', 'tetris.html', 'pong.html', 'memoria.html', 'clicker.html', 'rata.html', 'wordle.html', 'sopas.html'];

const MODERN_START = '<script type="module">\n        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";\n        import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";\n        import { getFirestore, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";';

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes(MODERN_START)) { console.log('SKIP (no coincide):', f); continue; }

  // 1) Script antiguo -> script moderno con librería común + pausa
  s = s.replace(MODERN_START, `<script src="arcade-lib.js"></script>
    <script>`);

  // 2) El juego arranca solo y guarda su récord al terminar
  const gameId = f.replace('.html', '');
  s = s.replace(`window.startGame = function() {`, `window.startGame = function() {\n            Arcade.pausable();`);

  // 3) Récord local inmediato en lugar de alert+addDoc
  s = s.replace(/async function gameOver\(\) \{[\s\S]*?\n        \}/, `function gameOver() {
            clearInterval(gameInterval);
            Arcade.finPartida({ id: '${gameId}', puntos: score, mensaje: '¡Juego terminado!' });
            setTimeout(window.startGame, 900);
        }`);

  fs.writeFileSync(f, s);
  console.log('OK:', f);
}

// Pong usa endGame en vez de gameOver
let p = fs.readFileSync('pong.html', 'utf8');
p = p.replace(`async function endGame() {
            cancelAnimationFrame(update);
            const msg = pScore >= 5 ? "¡Ganaste!" : "La IA gana.";
            alert(msg);
            if(currentUser && pScore > aiScore) {
                await addDoc(collection(db, "scores"), { userId: currentUser.uid, gameId: 'pong', score: pScore * 100, timestamp: new Date() });
            }
        }`, `function endGame() {
            running = false;
            const gano = pScore >= 5;
            Arcade.finPartida({ id: 'pong', puntos: gano ? pScore * 100 : 0, mensaje: gano ? '🏓 ¡GANASTE!' : 'La IA gana…' });
            setTimeout(() => location.reload(), 1600);
        }`);
// bucle rAF de pong con control de pausa
p = p.replace(`        function update() {
            // Movimiento bola`, `        let running = true;
        function update() {
            if (!running) return;
            // Movimiento bola`);
p = p.replace(`            draw();
            requestAnimationFrame(update);
        }`, `            draw();
            if (running) requestAnimationFrame(update);
        }
        Arcade.pausable(() => { if (!running && pScore < 5 && aiScore < 5) { running = true; requestAnimationFrame(update); } });`);
p = p.replace(`        update();`, `        update();`);
fs.writeFileSync('pong.html', p);
console.log('OK: pong.html (endGame + pausa rAF)');
