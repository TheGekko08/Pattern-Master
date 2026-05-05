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

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            score INTEGER DEFAULT 0
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

        if (count < 50) {
            console.log("🌱 Generando patrones...");
            const stmtInsert = db.prepare("INSERT OR IGNORE INTO secuencias (numeros, respuesta, dificultad) VALUES (?, ?, ?)");

            for (let i = 0; i < 30; i++) {
                let s = Math.floor(Math.random() * 20) + 1;
                let step = Math.floor(Math.random() * 9) + 1;
                stmtInsert.run([`${s}, ${s + step}, ${s + step * 2}, ${s + step * 3}`, s + step * 4, 'fácil']);
            }
            for (let i = 0; i < 20; i++) {
                let s = Math.floor(Math.random() * 5) + 1;
                let m = Math.floor(Math.random() * 3) + 2;
                let seq = [s, s * m, s * m * m, s * Math.pow(m, 3)].map(n => Math.round(n));
                let resp = Math.round(s * Math.pow(m, 4));
                if (resp < 10000) stmtInsert.run([seq.join(', '), resp, 'medio']);
            }
            
            stmtInsert.free();
            const data = db.export();
            fs.writeFileSync(DB_PATH, Buffer.from(data));
            console.log("✨ Patrones guardados.");
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
                const obj = {};
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
            const res = [];
            while (stmt.step()) {
                const vals = stmt.get();
                const obj = {};
                cols.forEach((c, i) => obj[c] = vals[i]);
                res.push(obj);
            }
            stmt.free();
            callback(null, res);
        } catch (e) { callback(e, null); }
    }
};