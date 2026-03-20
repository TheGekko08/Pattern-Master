// server.js
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

console.log("🚀 Iniciando servidor Pattern Master...");

// --- RUTAS API ---

// REGISTRO CORREGIDO
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
                console.error("Error DB insert:", err);
                return res.status(500).json({ error: "Error al guardar usuario" });
            }
            
            // OBTENER EL ID DEL USUARIO CREADO
            // Usamos this.lastID, pero si es null (fallo de sql.js), buscamos por nombre
            const userId = this.lastID; 
            
            if (!userId) {
                // Plan B: Buscar al usuario recién creado por su nombre
                db.get("SELECT id, username, score FROM users WHERE username = ?", [username], (err, row) => {
                    if (err || !row) {
                        console.error("Error buscando usuario tras registro:", err);
                        return res.status(500).json({ error: "Usuario creado pero no encontrado" });
                    }
                    res.json({ success: true, userId: row.id, username: row.username });
                });
            } else {
                // Plan A: Buscar por ID (lo normal)
                db.get("SELECT id, username, score FROM users WHERE id = ?", [userId], (err, row) => {
                    if (err || !row) {
                        console.error("Error buscando usuario por ID:", err);
                        return res.status(500).json({ error: "Usuario creado pero no encontrado" });
                    }
                    res.json({ success: true, userId: row.id, username: row.username });
                });
            }
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(400).json({ error: "Usuario no encontrado o contraseña incorrecta" });
        
        bcrypt.compare(password, user.password, (err, match) => {
            if (match) {
                res.json({ success: true, userId: user.id, username: user.username, score: user.score });
            } else {
                res.status(400).json({ error: "Contraseña incorrecta" });
            }
        });
    });
});

app.post('/api/update-score', (req, res) => {
    const { userId, points } = req.body;
    db.run("UPDATE users SET score = score + ? WHERE id = ?", [points, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT username, score FROM users ORDER BY score DESC LIMIT 10", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/nueva-secuencia', (req, res) => {
    const dificultad = req.query.dificultad || 'fácil';
    db.get("SELECT * FROM secuencias WHERE dificultad = ? ORDER BY RANDOM() LIMIT 1", [dificultad], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "No hay patrones" });
        res.json({ id: row.id, numeros: row.numeros, dificultad: row.dificultad });
    });
});

app.post('/api/verificar', (req, res) => {
    const { id, respuestaUsuario } = req.body;
    db.get("SELECT respuesta FROM secuencias WHERE id = ?", [id], (err, row) => {
        if (err || !row) return res.json({ correcto: false });
        const esCorrecto = Math.abs(parseFloat(respuestaUsuario) - parseFloat(row.respuesta)) < 0.05;
        res.json({ correcto: esCorrecto });
    });
});

// --- INICIO DEL SERVIDOR ---
db.init().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor corriendo en puerto ${PORT}`);
        console.log(`💡 Base de datos lista y conectada.`);
    });
}).catch(err => {
    console.error("❌ No se pudo iniciar la DB:", err);
    process.exit(1);
});