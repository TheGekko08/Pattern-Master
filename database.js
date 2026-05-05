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
            score_facil INTEGER DEFAULT 0,
            score_medio INTEGER DEFAULT 0,
            score_dificil INTEGER DEFAULT 0,
            score_experto INTEGER DEFAULT 0
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

        if (count < 200) {
            console.log("🌱 Generando 200 patrones (50 por dificultad)...");
            const stmtInsert = db.prepare("INSERT INTO secuencias (numeros, respuesta, dificultad) VALUES (?, ?, ?)");

            // FÁCIL - 50 patrones
            for (let i = 0; i < 25; i++) {
                let s = Math.floor(Math.random() * 20) + 1;
                let step = Math.floor(Math.random() * 9) + 1;
                stmtInsert.run([`${s}, ${s + step}, ${s + step * 2}, ${s + step * 3}`, s + step * 4, 'fácil']);
            }
            for (let i = 0; i < 25; i++) {
                let s = Math.floor(Math.random() * 50) + 20;
                let step = Math.floor(Math.random() * 5) + 1;
                stmtInsert.run([`${s}, ${s - step}, ${s - step * 2}, ${s - step * 3}`, s - step * 4, 'fácil']);
            }

            // MEDIO - 50 patrones
            for (let i = 0; i < 25; i++) {
                let s = Math.floor(Math.random() * 5) + 1;
                let m = Math.floor(Math.random() * 3) + 2;
                let seq = [s, s * m, s * m * m, s * Math.pow(m, 3)].map(n => Math.round(n));
                let resp = Math.round(s * Math.pow(m, 4));
                if (resp < 10000) stmtInsert.run([seq.join(', '), resp, 'medio']);
            }
            for (let i = 0; i < 25; i++) {
                let n = Math.floor(Math.random() * 5) + 1;
                let offset = Math.floor(Math.random() * 3);
                let seq = [Math.pow(n, 2) + offset, Math.pow(n + 1, 2) + offset, Math.pow(n + 2, 2) + offset, Math.pow(n + 3, 2) + offset];
                let resp = Math.pow(n + 4, 2) + offset;
                stmtInsert.run([seq.join(', '), resp, 'medio']);
            }

            // DIFÍCIL - 50 patrones
            const primos = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229];
            for (let i = 0; i < 25; i++) {
                if (i + 4 < primos.length) {
                    stmtInsert.run([`${primos[i]}, ${primos[i + 1]}, ${primos[i + 2]}, ${primos[i + 3]}`, primos[i + 4], 'difícil']);
                }
            }
            for (let i = 0; i < 25; i++) {
                let n = Math.floor(Math.random() * 6) + 1;
                let seq = [Math.pow(n, 3), Math.pow(n + 1, 3), Math.pow(n + 2, 3), Math.pow(n + 3, 3)];
                let resp = Math.pow(n + 4, 3);
                stmtInsert.run([seq.join(', '), resp, 'difícil']);
            }

            // EXPERTO - 50 patrones
            for (let i = 0; i < 17; i++) {
                if (i + 4 <= 7) {
                    let seq = [];
                    for (let k = 0; k < 4; k++) {
                        let num = i + k + 1, fact = 1;
                        for (let x = 1; x <= num; x++) fact *= x;
                        seq.push(fact);
                    }
                    let nextNum = i + 5, resp = 1;
                    for (let x = 1; x <= nextNum; x++) resp *= x;
                    stmtInsert.run([seq.join(', '), resp, 'experto']);
                }
            }
            for (let i = 0; i < 17; i++) {
                let a = Math.floor(Math.random() * 5) + 1;
                let b = Math.floor(Math.random() * 5) + 1;
                let c = a + b, d = b + c, e = c + d;
                stmtInsert.run([`${a}, ${b}, ${c}, ${d}`, e, 'experto']);
            }
            for (let i = 0; i < 16; i++) {
                let s = Math.floor(Math.random() * 10) + 1;
                let a = Math.floor(Math.random() * 7) + 2;
                let b = Math.floor(Math.random() * 7) + 2;
                let seq = [s, s + a, s + a + b, s + 2 * a + b];
                let resp = s + 2 * a + 2 * b;
                stmtInsert.run([seq.join(', '), resp, 'experto']);
            }

            stmtInsert.free();
            const data = db.export();
            fs.writeFileSync(DB_PATH, Buffer.from(data));
            console.log("✨ 200 patrones guardados (50 por dificultad).");
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