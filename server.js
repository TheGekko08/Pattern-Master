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

// REGISTRO CON REINTENTOS PARA SQL.JS
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    console.log(`📝 [REGISTER] Intento de registro para: "${username}"`);

    if (!username || !password) return res.status(400).json({ error: "Datos incompletos" });
    
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error("❌ [REGISTER] Error al hashear:", err);
            return res.status(500).json({ error: err.message });
        }
        
        // 1. Insertar usuario
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], function(err) {
            if (err) {
                console.error("❌ [REGISTER] Error DB insert:", err);
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: "El usuario ya existe" });
                }
                return res.status(500).json({ error: "Error al guardar usuario" });
            }
            
            console.log("✅ [REGISTER] Inserción ejecutada. Buscando usuario para confirmar...");

            // 2. Función recursiva para intentar encontrar al usuario
            const tryFindUser = (attempts) => {
                db.get("SELECT id, username, score FROM users WHERE username = ?", [username], (err, row) => {
                    if (err) {
                        console.error("❌ [REGISTER] Error buscando usuario:", err);
                        return res.status(500).json({ error: "Error interno"});
                    }
                    
                    if (row) {
                        // ¡Éxito! Usuario encontrado
                        console.log(`✅ [REGISTER] ¡Usuario encontrado! ID: ${row.id}, Username: ${row.username}`);
                        return res.json({ success: true, userId: row.id, username: row.username });
                    } else {
                        // No encontrado aún
                        if (attempts > 0) {
                            console.warn(`⚠️ [REGISTER] Usuario no visible aún. Reintentando (${attempts} intentos left)...`);
                            // Esperar 150ms y reintentar
                            setTimeout(() => tryFindUser(attempts - 1), 150);
                        } else {
                            // Fallo crítico tras varios intentos
                            console.error("❌ [REGISTER] Fallo crítico: Usuario insertado pero imposible de leer tras varios intentos.");
                            
                            // Debug extra: listar todos los usuarios para ver si está ahí
                            db.all("SELECT username FROM users", [], (err, allUsers) => {
                                if(allUsers) {
                                    console.log("👥 Usuarios actuales en DB:", allUsers.map(u => u.username));
                                } else {
                                    console.log("👥 No se pudo listar usuarios para debug.");
                                }
                            });
                            
                            return res.status(500).json({ error: "Error de sincronización de DB. Por favor intenta de nuevo." });
                        }
                    }
                });
            };

            // Iniciar la búsqueda con 5 reintentos
            tryFindUser(5);
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`🔑 [LOGIN] Intento de login para: "${username}"`);

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) {
            console.error("❌ [LOGIN] Error DB:", err);
            return res.status(500).json({ error: "Error de servidor" });
        }

        // DEBUG CRÍTICO: Ver qué devuelve exactamente la DB
        console.log("🔍 [LOGIN] Objeto RAW recibido de DB:", JSON.stringify(user));

        if (!user) {
            console.warn(`⚠️ [LOGIN] Usuario "${username}" NO encontrado en la DB.`);
            return res.status(400).json({ error: "Usuario no encontrado" });
        }

        // Verificación de seguridad antes de usar .substring()
        if (!user.password) {
            console.error("❌ [LOGIN] El usuario existe pero NO tiene contraseña (campo undefined o null).");
            console.error("   Campos disponibles:", Object.keys(user));
            return res.status(500).json({ error: "Error de datos de usuario (password faltante)" });
        }

        console.log(`💾 [LOGIN] Password en DB (inicio): ${user.password.substring(0, 20)}...`);
        console.log(`🔑 [LOGIN] Password intentada: "${password}"`);

        bcrypt.compare(password, user.password, (err, match) => {
            if (err) {
                console.error("❌ [LOGIN] Error en bcrypt.compare:", err);
                return res.status(500).json({ error: "Error al comparar contraseña" });
            }
            
            if (match) {
                console.log(`✅ [LOGIN] ¡Contraseña correcta! Acceso concedido.`);
                res.json({ success: true, userId: user.id, username: user.username, score: user.score });
            } else {
                console.log(`❌ [LOGIN] Contraseña INCORRECTA. El hash no coincide.`);
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
    console.log(`🎲 [JUEGO] Pidiendo patrón. Dificultad: ${dificultad}`);

    // 1. Verificar si la DB está lista
    if (!db) {
        console.error("❌ [JUEGO] ERROR CRÍTICO: La variable 'db' es nula.");
        return res.status(500).json({ error: "Base de datos no inicializada" });
    }

    // 2. Ejecutar la consulta
    db.get("SELECT * FROM secuencias WHERE dificultad = ? ORDER BY RANDOM() LIMIT 1", [dificultad], (err, row) => {
        if (err) {
            console.error("❌ [JUEGO] Error de SQL:", err.message);
            // Intentar listar tablas para ver si 'secuencias' existe
            db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err2, tables) => {
                if(tables) console.log("📋 Tablas existentes en DB:", tables.map(t => t.name));
                else console.log("📋 No se pudo listar tablas.");
            });
            return res.status(500).json({ error: "Error interno al buscar patrón: " + err.message });
        }
        
        if (!row) {
            console.warn(`⚠️ [JUEGO] No se encontraron patrones para dificultad '${dificultad}'.`);
            // Debug: contar cuántos hay en total
            db.get("SELECT count(*) as c FROM secuencias", [], (errCount, countRow) => {
                if(countRow) console.log(`🔢 Total de patrones en DB: ${countRow.c}`);
            });
            return res.status(404).json({ error: "No hay patrones disponibles para esta dificultad" });
        }

        console.log(`✅ [JUEGO] Patrón encontrado: ${row.numeros} -> ${row.respuesta}`);
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