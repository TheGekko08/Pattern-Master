// database.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'patrones.db');
let db = null;
let SQL = null;

async function initDB() {
    try {
        SQL = await initSqlJs();
        
        // FORZAR NUEVA BASE DE DATOS PARA EVITAR CORRUPTOS
        db = new SQL.Database();
        console.log("🆕 Nueva base de datos creada en memoria (Forzado)."); 

        // Crear tablas
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS secuencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numeros TEXT NOT NULL,
            respuesta REAL NOT NULL,
            dificultad TEXT NOT NULL
        )`);

        // Verificar patrones
        const stmtCount = db.prepare("SELECT count(*) as count FROM secuencias");
        stmtCount.step();
        const row = stmtCount.get();
        const count = row ? row.count : 0;
        stmtCount.free();

        if (count < 50) {
            console.log("🌱 Generando patrones...");
            const stmtInsert = db.prepare("INSERT OR IGNORE INTO secuencias (numeros, respuesta, dificultad) VALUES (?, ?, ?)");
            
            // FÁCIL
            for (let i = 0; i < 30; i++) {
                let start = Math.floor(Math.random() * 20) + 1;
                let step = Math.floor(Math.random() * 9) + 1;
                stmtInsert.run([`${start}, ${start+step}, ${start+(step*2)}, ${start+(step*3)}`, start+(step*4), 'fácil']);
                let startR = Math.floor(Math.random() * 50) + 20;
                let stepR = Math.floor(Math.random() * 5) + 1;
                stmtInsert.run([`${startR}, ${startR-stepR}, ${startR-(stepR*2)}, ${startR-(stepR*3)}`, startR-(stepR*4), 'fácil']);
            }
            // MEDIO
            for (let i = 0; i < 30; i++) {
                let startM = Math.floor(Math.random() * 5) + 1;
                let mult = Math.floor(Math.random() * 4) + 2;
                let seqM = [startM, startM*mult, startM*mult*mult, startM*Math.pow(mult,3)].map(n => Math.round(n));
                let respM = Math.round(startM * Math.pow(mult, 4));
                if(respM < 10000) stmtInsert.run([seqM.join(', '), respM, 'medio']);
                
                let offset = Math.floor(Math.random() * 3);
                let nStart = Math.floor(Math.random() * 5) + 1;
                let seqQ = [];
                for(let k=0; k<4; k++) seqQ.push(Math.pow(nStart+k, 2) + offset);
                stmtInsert.run([seqQ.join(', '), Math.pow(nStart+4, 2) + offset, 'medio']);
            }
            // DIFÍCIL
            const primos = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
            for (let i = 0; i < 10; i++) {
                if(i+4 < primos.length) stmtInsert.run([primos.slice(i, i+4).join(', '), primos[i+4], 'difícil']);
            }
            for (let i = 0; i < 20; i++) {
                let nStart = Math.floor(Math.random() * 6) + 1;
                let seqC = [];
                for(let k=0; k<4; k++) seqC.push(Math.pow(nStart+k, 3));
                stmtInsert.run([seqC.join(', '), Math.pow(nStart+4, 3), 'difícil']);
                
                let startAlt = Math.floor(Math.random() * 5) + 1;
                let sumVal = Math.floor(Math.random() * 3) + 1;
                let s1 = startAlt, s2 = s1 + sumVal, s3 = s2 * 2, s4 = s3 + sumVal;
                if(s4*2 < 5000) stmtInsert.run([`${s1}, ${s2}, ${s3}, ${s4}`, s4*2, 'difícil']);
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
                    stmtInsert.run([seqFact.join(', '), respFact, 'experto']);
                }
                let bases = [1.5, 2.5];
                let base = bases[i % 2];
                let startGeo = (Math.floor(Math.random() * 10) + 2) * 2;
                let g1 = startGeo, g2 = g1 * base, g3 = g2 * base, g4 = g3 * base, respGeo = g4 * base;
                if (Number.isInteger(g2*2) && Number.isInteger(respGeo*2)) {
                     stmtInsert.run([`${g1}, ${g2}, ${g3}, ${g4}`, parseFloat(respGeo.toFixed(1)), 'experto']);
                }
            }
            
            stmtInsert.free();
            saveDB();
            console.log("✨ Patrones generados y guardados.");
        }

        console.log("✅ Base de datos inicializada correctamente.");
    } catch (err) {
        console.error("❌ Error fatal iniciando DB:", err);
        throw err;
    }
}

function saveDB() {
    if (db) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(DB_PATH, buffer);
        } catch (err) {
            console.error("Error guardando DB en disco:", err);
        }
    }
}

// Wrapper mejorado para asegurar objetos con nombres de columna
module.exports = {
    init: initDB,
    
    get: (sql, params, callback) => {
        if (!db) return callback(new Error("DB no inicializada"), null);
        try {
            const stmt = db.prepare(sql);
            if (params) stmt.bind(params);
            
            if (stmt.step()) {
                const columnNames = stmt.getColumnNames();
                const values = stmt.get();
                const rowObj = {};
                columnNames.forEach((name, index) => {
                    rowObj[name] = values[index];
                });
                callback(null, rowObj);
            } else {
                callback(null, null);
            }
            stmt.free();
        } catch (err) {
            console.error("Error en db.get:", err);
            callback(err, null);
        }
    },
    
    run: (sql, params, callback) => {
        if (!db) return callback(new Error("DB no inicializada"), null);
        try {
            db.run(sql, params);
            saveDB();
            let lastID = null;
            if (sql.trim().toUpperCase().startsWith("INSERT")) {
                const res = db.exec("SELECT last_insert_rowid()");
                if (res.length > 0 && res[0].values.length > 0) {
                    lastID = res[0].values[0][0];
                }
            }
            callback(null, { lastID: lastID });
        } catch (err) {
            console.error("Error en db.run:", err);
            callback(err, null);
        }
    },
    
    all: (sql, params, callback) => {
        if (!db) return callback(new Error("DB no inicializada"), null);
        try {
            const stmt = db.prepare(sql);
            if (params) stmt.bind(params);
            const columnNames = stmt.getColumnNames();
            const results = [];
            while (stmt.step()) {
                const values = stmt.get();
                const rowObj = {};
                columnNames.forEach((name, index) => {
                    rowObj[name] = values[index];
                });
                results.push(rowObj);
            }
            stmt.free();
            callback(null, results);
        } catch (err) {
            console.error("Error en db.all:", err);
            callback(err, null);
        }
    }
};