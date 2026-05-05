const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'patrones.db');
let db = null;
let SQL = null;

async function initDB() {
    try {
        SQL = await initSqlJs();
        db = new SQL.Database();
        console.log("🆕 DB creada en memoria.");

        // Tabla de usuarios con puntuación separada por dificultad
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            score_facil    INTEGER DEFAULT 0,
            score_medio    INTEGER DEFAULT 0,
            score_dificil  INTEGER DEFAULT 0,
            score_experto  INTEGER DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS secuencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numeros TEXT NOT NULL,
            respuesta REAL NOT NULL,
            dificultad TEXT NOT NULL
        )`);

        const stmtCount = db.prepare("SELECT count(*) as count FROM secuencias");
        stmtCount.step();
        const count = stmtCount.get().count;
        stmtCount.free();

        if (count < 100) {
            console.log("🌱 Generando patrones para las 4 dificultades...");
            const stmtInsert = db.prepare(
                "INSERT OR IGNORE INTO secuencias (numeros, respuesta, dificultad) VALUES (?, ?, ?)"
            );

            // ── FÁCIL: secuencias aritméticas simples ──────────────────────
            for (let i = 0; i < 40; i++) {
                let s    = Math.floor(Math.random() * 20) + 1;
                let step = Math.floor(Math.random() * 9)  + 1;
                stmtInsert.run([
                    `${s}, ${s + step}, ${s + step * 2}, ${s + step * 3}`,
                    s + step * 4,
                    'fácil'
                ]);
            }

            // ── MEDIO: secuencias geométricas ──────────────────────────────
            for (let i = 0; i < 40; i++) {
                let s = Math.floor(Math.random() * 5) + 1;
                let m = Math.floor(Math.random() * 3) + 2;
                let seq = [s, s * m, s * m * m, s * Math.pow(m, 3)].map(n => Math.round(n));
                let resp = Math.round(s * Math.pow(m, 4));
                if (resp < 10000) stmtInsert.run([seq.join(', '), resp, 'medio']);
            }

            // ── DIFÍCIL: diferencias de segundo orden / cuadráticos ────────
            for (let i = 0; i < 40; i++) {
                // a·n² + b·n + c  (n = 1..5)
                let a = Math.floor(Math.random() * 4) + 1;  // 1..4
                let b = Math.floor(Math.random() * 6);       // 0..5
                let c = Math.floor(Math.random() * 10);      // 0..9
                let terms = [1, 2, 3, 4].map(n => a * n * n + b * n + c);
                let resp  = a * 25 + b * 5 + c;
                stmtInsert.run([terms.join(', '), resp, 'difícil']);
            }

            // ── EXPERTO: Fibonacci-like / combinados ───────────────────────
            for (let i = 0; i < 40; i++) {
                const type = i % 3;
                if (type === 0) {
                    // Fibonacci desplazado: cada término = suma de los dos anteriores
                    let a = Math.floor(Math.random() * 5) + 1;
                    let b = Math.floor(Math.random() * 5) + 1;
                    let c = a + b, d = b + c, e = c + d;
                    stmtInsert.run([`${a}, ${b}, ${c}, ${d}`, e, 'experto']);
                } else if (type === 1) {
                    // Potencias: 2^n o 3^n con offset
                    let base   = Math.random() < 0.5 ? 2 : 3;
                    let offset = Math.floor(Math.random() * 10);
                    let terms  = [1, 2, 3, 4].map(n => Math.pow(base, n) + offset);
                    let resp   = Math.pow(base, 5) + offset;
                    if (resp < 500) stmtInsert.run([terms.join(', '), resp, 'experto']);
                } else {
                    // Aritmética alternada: +a, +b, +a, +b …
                    let s  = Math.floor(Math.random() * 10) + 1;
                    let a2 = Math.floor(Math.random() * 7)  + 2;
                    let b2 = Math.floor(Math.random() * 7)  + 2;
                    let t  = [s, s + a2, s + a2 + b2, s + 2 * a2 + b2];
                    let r  = s + 2 * a2 + 2 * b2;
                    stmtInsert.run([t.join(', '), r, 'experto']);
                }
            }

            stmtInsert.free();
            const data = fs.existsSync(DB_PATH)
                ? fs.readFileSync(DB_PATH)
                : null;
            fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
            console.log("✨ Patrones guardados para las 4 dificultades.");
        }
        console.log("✅ DB lista.");
    } catch (err) {
        console.error("❌ Error DB:", err);
        throw err;
    }
}

module.exports = {
    init: initDB,

    get: (sql, params, callback) => {
        if (!db) return callback(new Error("DB null"));
        try {
            const stmt = db.prepare(sql);
            if (params) stmt.bind(params);
            if (stmt.step()) {
                const cols = stmt.getColumnNames();
                const vals = stmt.get();
                const obj  = {};
                cols.forEach((c, i) => obj[c] = vals[i]);
                callback(null, obj);
            } else {
                callback(null, null);
            }
            stmt.free();
        } catch (e) { callback(e, null); }
    },

    run: (sql, params, callback) => {
        if (!db) return callback(new Error("DB null"));
        try {
            db.run(sql, params);
            callback(null, {});
        } catch (e) { callback(e, null); }
    },

    all: (sql, params, callback) => {
        if (!db) return callback(new Error("DB null"));
        try {
            const stmt = db.prepare(sql);
            if (params) stmt.bind(params);
            const cols = stmt.getColumnNames();
            const res  = [];
            while (stmt.step()) {
                const vals = stmt.get();
                const obj  = {};
                cols.forEach((c, i) => obj[c] = vals[i]);
                res.push(obj);
            }
            stmt.free();
            callback(null, res);
        } catch (e) { callback(e, null); }
    }
};