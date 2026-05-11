const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log('🚀 Iniciando servidor Pattern Master...');

app.get('/api/config', (req, res) => {
    try {
        const symbols = db.getAllSymbols();
        const difficulties = db.getAllDifficulties();
        
        const symbolsObj = {};
        symbols.forEach(s => {
            symbolsObj[s.name] = s.symbol;
        });

        const difficultiesObj = {};
        difficulties.forEach(d => {
            difficultiesObj[d.name] = {
                timeLimit: d.time_limit,
                pointsWin: d.points_win,
                pointsLose: d.points_lose,
                colorCode: d.color_code,
                displayName: d.display_name
            };
        });

        res.json({
            symbols: symbolsObj,
            difficulties: difficultiesObj,
            maxLives: parseInt(db.getConfigValue('max_lives')),
            maxLoginAttempts: parseInt(db.getConfigValue('max_login_attempts')),
            loginBlockMinutes: parseInt(db.getConfigValue('login_block_minutes'))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Datos incompletos' });

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: err.message });

        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], (err) => {
            if (err) {
                if (err.message && err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'El usuario ya existe' });
                }
                return res.status(500).json({ error: 'Error al guardar' });
            }

            const tryFind = (attempts) => {
                db.get('SELECT id, username FROM users WHERE username = ?', [username], (err, row) => {
                    if (row) return res.json({ success: true, userId: row.id, username: row.username });
                    if (attempts > 0) setTimeout(() => tryFind(attempts - 1), 150);
                    else res.status(500).json({ error: 'Error de sincronización' });
                });
            };
            tryFind(5);
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const maxAttempts = parseInt(db.getConfigValue('max_login_attempts')) || 5;
    const blockMinutes = parseInt(db.getConfigValue('login_block_minutes')) || 15;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Usuario no encontrado' });
        if (!user.password) return res.status(500).json({ error: 'Error de datos' });

        const now = Date.now();
        if (user.locked_until && user.locked_until > now) {
            const remaining = Math.ceil((user.locked_until - now) / 1000);
            return res.status(403).json({ 
                error: 'Cuenta bloqueada', 
                blocked: true, 
                remainingSeconds: remaining 
            });
        }

        if (user.locked_until && user.locked_until <= now) {
            db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (match) {
                db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
                res.json({
                    success: true,
                    userId: user.id,
                    username: user.username,
                    score_facil: user.score_facil,
                    score_medio: user.score_medio,
                    score_dificil: user.score_dificil,
                    score_experto: user.score_experto
                });
            } else {
                const newAttempts = (user.failed_attempts || 0) + 1;

                if (newAttempts >= maxAttempts) {
                    const lockedUntil = Date.now() + blockMinutes * 60 * 1000;
                    db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [newAttempts, lockedUntil, user.id]);
                    return res.status(403).json({ 
                        error: `Demasiados intentos. Cuenta bloqueada por ${blockMinutes} minutos.`, 
                        blocked: true, 
                        remainingSeconds: blockMinutes * 60 
                    });
                } else {
                    db.run('UPDATE users SET failed_attempts = ? WHERE id = ?', [newAttempts, user.id]);
                    return res.status(400).json({ 
                        error: `Contraseña incorrecta. Intentos restantes: ${maxAttempts - newAttempts}` 
                    });
                }
            }
        });
    });
});

app.post('/api/update-score', (req, res) => {
    const { userId, points, dificultad } = req.body;
    const scoreCol = `score_${dificultad}`;

    db.get(`SELECT ${scoreCol} as currentScore FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'Usuario no encontrado' });

        const currentScore = row.currentScore || 0;
        const newScore = Math.max(0, currentScore + points);

        db.run(`UPDATE users SET ${scoreCol} = ? WHERE id = ?`, [newScore, userId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, newScore });
        });
    });
});

app.get('/api/leaderboard', (req, res) => {
    const dificultad = req.query.dificultad || 'fácil';
    const col = `score_${dificultad}`;

    db.all(`SELECT username, ${col} as score FROM users WHERE ${col} > 0 ORDER BY ${col} DESC LIMIT 10`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/nueva-secuencia', (req, res) => {
    const dificultad = req.query.dificultad || 'fácil';
    const config = db.getDifficultyConfig(dificultad);

    if (!config) return res.status(400).json({ error: 'Dificultad inválida' });

    db.get('SELECT * FROM secuencias WHERE dificultad = ? ORDER BY RANDOM() LIMIT 1', [dificultad], (err, row) => {
        if (err) return res.status(500).json({ error: 'Error SQL: ' + err.message });
        if (!row) return res.status(404).json({ error: 'Sin patrones' });

        res.json({ 
            id: row.id, 
            numeros: row.numeros, 
            dificultad: row.dificultad,
            timeLimit: config.time_limit
        });
    });
});

app.post('/api/verificar', (req, res) => {
    const { id, respuestaUsuario } = req.body;
    db.get('SELECT respuesta FROM secuencias WHERE id = ?', [id], (err, row) => {
        if (err || !row) return res.json({ correcto: false });
        const esCorrecto = Math.abs(parseFloat(respuestaUsuario) - parseFloat(row.respuesta)) < 0.05;
        res.json({ correcto: esCorrecto, respuestaCorrecta: esCorrecto ? null : row.respuesta });
    });
});

db.init().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    });
}).catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});