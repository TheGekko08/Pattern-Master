const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const CONFIG_DB_PATH = path.join(__dirname, 'config.db');
const DATA_DB_PATH = path.join(__dirname, 'patrones.db');

let configDb = null;
let dataDb = null;

function initConfigDB() {
    try {
        if (!fs.existsSync(CONFIG_DB_PATH)) {
            throw new Error('config.db no existe. Ejecuta generate_config_db.js primero');
        }
        
        configDb = new Database(CONFIG_DB_PATH, { readonly: true });
        console.log('🗄️ config.db conectada (solo lectura)');
        
        return configDb;
    } catch (err) {
        console.error('❌ Error config.db:', err);
        throw err;
    }
}

function initDataDB() {
    try {
        dataDb = new Database(DATA_DB_PATH);
        console.log('🗄️ patrones.db conectada (lectura/escritura)');

        dataDb.pragma('foreign_keys = ON');

        dataDb.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                score_facil INTEGER DEFAULT 0,
                score_medio INTEGER DEFAULT 0,
                score_dificil INTEGER DEFAULT 0,
                score_experto INTEGER DEFAULT 0,
                failed_attempts INTEGER DEFAULT 0,
                locked_until INTEGER DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        dataDb.exec(`
            CREATE TABLE IF NOT EXISTS secuencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numeros TEXT NOT NULL,
                respuesta REAL NOT NULL,
                dificultad TEXT NOT NULL
            )
        `);

        const count = dataDb.prepare('SELECT COUNT(*) as c FROM secuencias').get();
        
        if (count.c < 200) {
            console.log('🌱 Generando 200 patrones...');
            dataDb.exec('DELETE FROM secuencias');
            
            const insert = dataDb.prepare('INSERT INTO secuencias (numeros, respuesta, dificultad) VALUES (?, ?, ?)');
            const transaction = dataDb.transaction((patterns) => {
                for (const p of patterns) insert.run(p);
            });

            const patterns = [];

            for (let i = 0; i < 25; i++) {
                let s = Math.floor(Math.random() * 20) + 1;
                let step = Math.floor(Math.random() * 9) + 1;
                patterns.push([`${s}, ${s + step}, ${s + step * 2}, ${s + step * 3}`, s + step * 4, 'fácil']);
            }
            for (let i = 0; i < 25; i++) {
                let s = Math.floor(Math.random() * 50) + 20;
                let step = Math.floor(Math.random() * 5) + 1;
                patterns.push([`${s}, ${s - step}, ${s - step * 2}, ${s - step * 3}`, s - step * 4, 'fácil']);
            }

            for (let i = 0; i < 25; i++) {
                let s = Math.floor(Math.random() * 5) + 1;
                let m = Math.floor(Math.random() * 3) + 2;
                let seq = [s, s * m, s * m * m, s * Math.pow(m, 3)].map(n => Math.round(n));
                let resp = Math.round(s * Math.pow(m, 4));
                if (resp < 10000) patterns.push([seq.join(', '), resp, 'medio']);
            }
            for (let i = 0; i < 25; i++) {
                let n = Math.floor(Math.random() * 5) + 1;
                let offset = Math.floor(Math.random() * 3);
                let seq = [Math.pow(n, 2) + offset, Math.pow(n + 1, 2) + offset, Math.pow(n + 2, 2) + offset, Math.pow(n + 3, 2) + offset];
                let resp = Math.pow(n + 4, 2) + offset;
                patterns.push([seq.join(', '), resp, 'medio']);
            }

            const primos = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229];
            for (let i = 0; i < 25; i++) {
                if (i + 4 < primos.length) {
                    patterns.push([`${primos[i]}, ${primos[i + 1]}, ${primos[i + 2]}, ${primos[i + 3]}`, primos[i + 4], 'difícil']);
                }
            }
            for (let i = 0; i < 25; i++) {
                let n = Math.floor(Math.random() * 6) + 1;
                let seq = [Math.pow(n, 3), Math.pow(n + 1, 3), Math.pow(n + 2, 3), Math.pow(n + 3, 3)];
                let resp = Math.pow(n + 4, 3);
                patterns.push([seq.join(', '), resp, 'difícil']);
            }

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
                    patterns.push([seq.join(', '), resp, 'experto']);
                }
            }
            for (let i = 0; i < 17; i++) {
                let a = Math.floor(Math.random() * 5) + 1;
                let b = Math.floor(Math.random() * 5) + 1;
                let c = a + b, d = b + c, e = c + d;
                patterns.push([`${a}, ${b}, ${c}, ${d}`, e, 'experto']);
            }
            for (let i = 0; i < 16; i++) {
                let s = Math.floor(Math.random() * 10) + 1;
                let a = Math.floor(Math.random() * 7) + 2;
                let b = Math.floor(Math.random() * 7) + 2;
                let seq = [s, s + a, s + a + b, s + 2 * a + b];
                let resp = s + 2 * a + 2 * b;
                patterns.push([seq.join(', '), resp, 'experto']);
            }

            transaction(patterns);
            console.log('✨ 200 patrones guardados');
        }

        console.log('✅ patrones.db lista');
        return dataDb;
    } catch (err) {
        console.error('❌ Error patrones.db:', err);
        throw err;
    }
}

module.exports = {
    init: () => {
        initConfigDB();
        initDataDB();
        return Promise.resolve({ configDb, dataDb });
    },

    getConfigValue: (key) => {
        try {
            const stmt = configDb.prepare('SELECT value FROM game_config WHERE key = ?');
            const row = stmt.get(key);
            return row ? row.value : null;
        } catch (err) {
            console.error('Error obteniendo config:', err);
            return null;
        }
    },

    getAllSymbols: () => {
        try {
            const stmt = configDb.prepare('SELECT * FROM symbols');
            return stmt.all();
        } catch (err) {
            console.error('Error obteniendo símbolos:', err);
            return [];
        }
    },

    getDifficultyConfig: (name) => {
        try {
            const stmt = configDb.prepare('SELECT * FROM difficulty_config WHERE name = ?');
            return stmt.get(name);
        } catch (err) {
            console.error('Error obteniendo dificultad:', err);
            return null;
        }
    },

    getAllDifficulties: () => {
        try {
            const stmt = configDb.prepare('SELECT * FROM difficulty_config ORDER BY points_win ASC');
            return stmt.all();
        } catch (err) {
            console.error('Error obteniendo dificultades:', err);
            return [];
        }
    },
    
    get: (sql, params, callback) => {
        try {
            const stmt = dataDb.prepare(sql);
            const row = stmt.get(...params);
            callback(null, row || null);
        } catch (err) {
            callback(err, null);
        }
    },
    
    all: (sql, params, callback) => {
        try {
            const stmt = dataDb.prepare(sql);
            const rows = stmt.all(...params);
            callback(null, rows);
        } catch (err) {
            callback(err, null);
        }
    },
    
    run: (sql, params, callback) => {
        try {
            const stmt = dataDb.prepare(sql);
            const info = stmt.run(...params);
            callback(null, { lastID: info.lastInsertRowid, changes: info.changes });
        } catch (err) {
            callback(err, null);
        }
    }
};