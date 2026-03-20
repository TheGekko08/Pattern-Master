// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- RUTAS API (Igual que antes) ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Datos incompletos" });
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);
        const [rows] = await db.query("SELECT id, username, score FROM users WHERE username = ?", [username]);
        res.json({ success: true, userId: rows[0].id, username: rows[0].username });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "El usuario ya existe" });
        console.error("Error registro:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
        if (rows.length === 0) return res.status(400).json({ error: "Usuario no encontrado" });
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) res.json({ success: true, userId: user.id, username: user.username, score: user.score });
        else res.status(400).json({ error: "Contraseña incorrecta" });
    } catch (err) {
        console.error("Error login:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/update-score', async (req, res) => {
    try {
        const { userId, points } = req.body;
        await db.query("UPDATE users SET score = score + ? WHERE id = ?", [points, userId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Error score:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT username, score FROM users ORDER BY score DESC LIMIT 10");
        res.json(rows);
    } catch (err) {
        console.error("Error leaderboard:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/nueva-secuencia', async (req, res) => {
    try {
        const dificultad = req.query.dificultad || 'fácil';
        const [rows] = await db.query("SELECT id, numeros, dificultad FROM secuencias WHERE dificultad = ? ORDER BY RAND() LIMIT 1", [dificultad]);
        if (rows.length === 0) return res.status(404).json({ error: "No hay patrones" });
        res.json(rows[0]);
    } catch (err) {
        console.error("Error secuencia:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/verificar', async (req, res) => {
    try {
        const { id, respuestaUsuario } = req.body;
        const [rows] = await db.query("SELECT respuesta FROM secuencias WHERE id = ?", [id]);
        if (rows.length === 0) return res.json({ correcto: false });
        const diff = Math.abs(parseFloat(respuestaUsuario) - parseFloat(rows[0].respuesta));
        res.json({ correcto: diff < 0.05 });
    } catch (err) {
        console.error("Error verificar:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- INICIO DEL SERVIDOR CON ESPERA DE DB ---
const PORT = process.env.PORT || 3000;

// ... (todo tu código de rutas arriba) ...

async function startServer() {
    try {
        console.log('⏳ Conectando a la base de datos...');
        await db.init(); 
        
        // CAMBIO IMPORTANTE AQUÍ:
        // Escuchamos en '0.0.0.0' para que Railway pueda acceder
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ ¡Todo listo! Servidor corriendo en http://0.0.0.0:${PORT}`);
            console.log(`💡 Base de datos conectada y tablas verificadas.`);
        });
    } catch (error) {
        console.error('❌ FATAL: No se pudo iniciar:', error.message);
    }
}

startServer();