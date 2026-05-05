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

const DIFF_COL = {
    'fácil': 'score_facil',
    'medio': 'score_medio',
    'difícil': 'score_dificil',
    'experto': 'score_experto'
};

console.log("🚀 Iniciando servidor Pattern Master...");

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Datos incompletos" });

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: err.message });

        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: "El usuario ya existe" });
                }
                return res.status(500).json({ error: "Error al guardar" });
            }

            const tryFind = (attempts) => {
                db.get("SELECT id, username FROM users WHERE username = ?", [username], (err, row) => {
                    if (row) return res.json({ success: true, userId: row.id, username: row.username });
                    if (attempts > 0) setTimeout(() => tryFind(attempts - 1), 150);
                    else res.status(500).json({ error: "Error de sincronización. Intenta de nuevo." });
                });
            };
            tryFind(5);
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(400).json({ error: "Usuario no encontrado" });
        if (!user.password) return res.status(500).json({ error: "Error de datos" });

        bcrypt.compare(password, user.password, (err, match) => {
            if (match) {
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
                res.status(400).json({ error: "Contraseña incorrecta" });
            }
        });
    });
});

app.post('/api/update-score', (req, res) => {
    const { userId, points, dificultad } = req.body;
    const col = DIFF_COL[dificultad];
    if (!col) return res.status(400).json({ error: "Dificultad inválida" });

    db.get(`SELECT ${col} as current FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err || !row) return res.status(500).json({ error: "Usuario no encontrado" });

        const current = row.current || 0;
        const newScore = Math.max(0, current + points);
        const delta = newScore - current;

        db.run(`UPDATE users SET ${col} = ? WHERE id = ?`, [newScore, userId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, newScore, delta });
        });
    });
});

app.get('/api/leaderboard', (req, res) => {
    const dificultad = req.query.dificultad || 'fácil';
    const col = DIFF_COL[dificultad];
    if (!col) return res.status(400).json({ error: "Dificultad inválida" });

    db.all(`SELECT username, ${col} as score FROM users WHERE ${col} > 0 ORDER BY ${col} DESC LIMIT 10`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/nueva-secuencia', (req, res) => {
    const dificultad = req.query.dificultad || 'fácil';
    if (!DIFF_COL[dificultad]) return res.status(400).json({ error: "Dificultad inválida" });

    db.get("SELECT * FROM secuencias WHERE dificultad = ? ORDER BY RANDOM() LIMIT 1", [dificultad], (err, row) => {
        if (err) return res.status(500).json({ error: "Error SQL: " + err.message });
        if (!row) return res.status(404).json({ error: "Sin patrones para esta dificultad" });
        
        res.json({ id: row.id, numeros: row.numeros, dificultad: row.dificultad });
    });
});

app.post('/api/verificar', (req, res) => {
    const { id, respuestaUsuario } = req.body;
    db.get("SELECT respuesta FROM secuencias WHERE id = ?", [id], (err, row) => {
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
    console.error("❌ Error fatal:", err);
    process.exit(1);
});