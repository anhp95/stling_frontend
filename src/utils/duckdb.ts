import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_next,
        mainWorker: eh_worker,
    },
};

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<{ db: duckdb.AsyncDuckDB, conn: duckdb.AsyncDuckDBConnection }> | null = null;
const registeredTables = new Set<string>();

export async function getDuckDB() {
    if (db && conn) return { db, conn };
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const logger = new duckdb.ConsoleLogger();
            const bundle = MANUAL_BUNDLES.eh;
            if (!bundle) throw new Error('DuckDB bundle not found');
            
            const worker = new Worker(bundle.mainWorker!);
            const _db = new duckdb.AsyncDuckDB(logger, worker);
            await _db.instantiate(bundle.mainModule);
            const _conn = await _db.connect();
            
            db = _db;
            conn = _conn;
            return { db: _db, conn: _conn };
        } catch (err) {
            initPromise = null;
            throw err;
        }
    })();

    return initPromise;
}

export async function queryDuckDB(sql: string) {
    const { conn } = await getDuckDB();
    if (!conn) throw new Error('DuckDB not initialized');
    
    const result = await conn.query(sql);
    const fields = result.schema.fields.map(f => f.name);
    
    return result.toArray().map((row: any) => {
        const obj: any = {};
        for (const field of fields) {
            const val = row[field];
            obj[field] = typeof val === 'bigint' ? Number(val) : val;
        }
        return obj;
    });
}

export function isTableRegistered(tableName: string) {
    return registeredTables.has(tableName);
}

export function registerTableName(tableName: string) {
    registeredTables.add(tableName);
}
