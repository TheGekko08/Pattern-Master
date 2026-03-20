// database.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'patrones.db');
let db;

async function initDB() {
    try {
        const SQL = await initSqlJs();
        
        // Intentar cargar la DB si existe, sino crear una nueva
        let fileBuffer;
        if (fs.existsSync(DB_PATH)) {
            fileBuffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(fileBuffer);
            console.log("💾 Base de datos cargada desde disco.");
        } else {
            db = new SQL.Database();
            console.log("🆕 Nueva base de datos creada en memoria.");
        }

        // Crear tablas
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            score INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS secuencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numeros TEXT,
            respuesta REAL,
            dificultad TEXT
        )`);

        // Verificar patrones
        const stmt = db.prepare("SELECT count(*) as count FROM secuencias");
        stmt.step();
        const row = stmt.get();
        const count = row ? row.count : 0;
        stmt.free();

        if (count < 50) {
            console.log("🌱 Generando patrones...");
            let patterns = [];
            // (Misma lógica de generación de antes)
            // FÁCIL
            for (let i = 0; i < 30; i++) {
                let start = Math.floor(Math.random() * 20) + 1;
                let step = Math.floor(Math.random() * 9) + 1;
                patterns.push([`${start}, ${start+step}, ${start+(step*2)}, ${start+(step*3)}`, start+(step*4), 'fácil']);
                let startR = Math.floor(Math.random() * 50) + 20;
                let stepR = Math.floor(Math.random() * 5) + 1;
                patterns.push([`${startR}, ${startR-stepR}, ${startR-(stepR*2)}, ${startR-(stepR*3)}`, startR-(stepR*4), 'fácil']);
            }
            // MEDIO
            for (let i = 0; i < 30; i++) {
                let startM = Math.floor(Math.random() * 5) + 1;
                let mult = Math.floor(Math.random() * 4) + 2;
                let seqM = [startM, startM*mult, startM*mult*mult, startM*Math.pow(mult,3)].map(n => Math.round(n));
                let respM = Math.round(startM * Math.pow(mult, 4));
                if(respM < 10000) patterns.push([seqM.join(', '), respM, 'medio']);
                let offset = Math.floor(Math.random() * 3);
                let nStart = Math.floor(Math.random() * 5) + 1;
                let seqQ = [];
                for(let k=0; k<4; k++) seqQ.push(Math.pow(nStart+k, 2) + offset);
                patterns.push([seqQ.join(', '), Math.pow(nStart+4, 2) + offset, 'medio']);
            }
             // DIFÍCIL
             const primos = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
            for (let i = 0; i < 10; i++) {
                if(i+4 < primos.length) patterns.push([primos.slice(i, i+4).join(', '), primos[i+4], 'difícil']);
            }
            for (let i = 0; i < 20; i++) {
                let nStart = Math.floor(Math.random() * 6) + 1;
                let seqC = [];
                for(let k=0; k<4; k++) seqC.push(Math.pow(nStart+k, 3));
                patterns.push([seqC.join(', '), Math.pow(nStart+4, 3), 'difícil']);
                let startAlt = Math.floor(Math.random() * 5) + 1;
                let sumVal = Math.floor(Math.random() * 3) + 1;
                let s1 = startAlt, s2 = s1 + sumVal, s3 = s2 * 2, s4 = s3 + sumVal;
                if(s4*2 < 5000) patterns.push([`${s1}, ${s2}, ${s3}, ${s4}`, s4*2, 'difícil']);
            }
            // EXPERTO
            for (let i = 0; i < 25; i++) {
                let startFact = Math.floor(Math.random() * 3) + 1;
                if (startFact + 4 <= 7) {
                    let seqFact = [];
                    for(let k=0; k<4; k++) {
                        let n = startFact + k, f = 1; 
                        for(let x=1; x<=n; x++) f*=x;
                        seqFact.push(f);
                    }
                    let nextN = startFact + 4, respFact = 1; 
                    for(let x=1; x<=nextN; x++) respFact*=x;
                    patterns.push([seqFact.join(', '), respFact, 'experto']);
                }
                let bases = [1.5, 2.5];
                let base = bases[i % 2];
                let startGeo = (Math.floor(Math.random() * 10) + 2) * 2;
                let g1 = startGeo, g2 = g1 * base, g3 = g2 * base, g4 = g3 * base, respGeo = g4 * base;
                if (Number.isInteger(g2*2) && Number.isInteger(respGeo*2)) {
                     patterns.push([`${g1}, ${g2}, ${g3}, ${g4}`, parseFloat(respGeo.toFixed(1)), 'experto']);
                }
            }

            const stmtInsert = db.prepare("INSERT OR IGNORE INTO secuencias (numeros, respuesta, dificultad) VALUES (?, ?, ?)");
            patterns.forEach(p => {
                stmtInsert.run([p[0], p[1], p[2]]);
            });
            stmtInsert.free();
            saveDB();
            console.log(`✨ ${patterns.length} patrones generados.`);
        }

        console.log("✅ Base de datos lista.");
    } catch (err) {
        console.error("❌ Error iniciando DB:", err);
    }
}

function saveDB() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// Wrapper para usar promesas o callbacks como antes
module.exports = {
    get: (sql, params, callback) => {
        try {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.get();
                callback(null, row);
            } else {
                callback(null, null);
            }
            stmt.free();
        } catch (err) {
            callback(err, null);
        }
    },
    run: (sql, params, callback) => {
        try {
            db.run(sql, params);
            saveDB(); // Guardar cambios en disco después de cada escritura
            callback(null, { lastID: db.exec("SELECT last_insert_rowid()")[0].values[0][0] });
        } catch (err) {
            callback(err, null);
        }
    },
    all: (sql, params, callback) => {
        try {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const results = [];
            while (stmt.step()) {
                results.push(stmt.get());
            }
            stmt.free();
            callback(null, results);
        } catch (err) {
            callback(err, null);
        }
    },
    init: initDB
};