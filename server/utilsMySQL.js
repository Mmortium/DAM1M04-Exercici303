var mysql   = require('mysql2')

class Obj {

    // Inicia la connexió amb la base de dades
    init (parameters) {
        this.pool  = mysql.createPool({
            connectionLimit : 10,
            host        : parameters.host,
            port        : parameters.port,
            user        : parameters.user,
            password    : parameters.password,
            database    : parameters.database
        })

        this.pool.on('connection', (connection) => { connection.query('SET @@session.group_concat_max_len = @@global.max_allowed_packet') })
        console.log('MySQL connected with destination: ' + this.db)
    }

    // Tanca la connexió amb la base de dades
    end () {
        this.pool.end()
    }

    // Fer una consulta a la base de dades
    callbackQuery (queryStr, callback) {
        this.pool.getConnection((err, connection) => {
            if (err) {
                return callback(err)
            } else {
                return connection.query(queryStr, (err, rst) => {
                    connection.release()
                    return callback(err, rst)
                })
            }
        })
    }

    // Fer una consulta a la base de dades amb 'promises'
    query (queryStr) {
        return new Promise((resolve, reject) => {
            return this.callbackQuery(queryStr, (err, rst) => { if (err)  { return reject(err) } else { return resolve(rst) } })
        })
    }

    // Converteix el resultat d'una consulta a un array d'objectes JSON, amb opcions de tipus
    table_to_json(rows, schema = {}) {
        const cast = (v, forcedType) => {
            if (v === null || v === undefined) return null;

            // Forced types
            if (forcedType === 'string') return String(v);
            if (forcedType === 'number') return typeof v === 'number' ? v : Number(v);
            if (forcedType === 'boolean') {
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v !== 0;
            const s = String(v).toLowerCase();
            if (s === 'true') return true;
            if (s === 'false') return false;
            const n = Number(s);
            return Number.isNaN(n) ? Boolean(v) : n !== 0;
            }
            if (forcedType === 'date') {
            if (v instanceof Date) return v.toISOString().slice(0, 10);
            return String(v);
            }
            if (forcedType === 'datetime') {
            if (v instanceof Date) return v.toISOString();
            return String(v);
            }

            // Inference
            if (Buffer.isBuffer(v)) return v.toString('utf8');
            if (v instanceof Date) return v.toISOString();
            if (typeof v === 'bigint') {
            const n = Number(v);
            return Number.isSafeInteger(n) ? n : v.toString();
            }
            if (typeof v === 'number' || typeof v === 'boolean') return v;

            if (typeof v === 'string') {
            const s = v.trim();
            const low = s.toLowerCase();
            if (low === 'true') return true;
            if (low === 'false') return false;

            if (/^-?\d+(\.\d+)?$/.test(s)) {
                const n = Number(s);
                if (!Number.isNaN(n) && Number.isFinite(n)) return n;
            }
            return v;
            }

            return v;
        };

        return rows.map((row) => {
            const obj = {};
            for (const [col, val] of Object.entries(row)) {
            obj[col] = cast(val, schema[col]);
            }
            return obj;
        });
    }

}

// Export
module.exports = Obj
