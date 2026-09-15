import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const migrations=[
  readFileSync(new URL('../../migrations/0001_workshop_sessions.sql',import.meta.url),'utf8'),
  readFileSync(new URL('../../migrations/0002_account_auth.sql',import.meta.url),'utf8'),
];

// A real SQLite adapter, including transaction rollback and trigger execution.
// Only the D1 methods used by the production store are represented here.
export function createSqliteD1(filename=':memory:',{migrate=true}={}) {
  const sqlite=new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if(migrate) {
    sqlite.exec('CREATE TABLE IF NOT EXISTS test_schema_migrations (version INTEGER PRIMARY KEY);');
    migrations.forEach((migration,index)=>{
      const version=index+1;
      if(sqlite.prepare('SELECT version FROM test_schema_migrations WHERE version=?').get(version))return;
      sqlite.exec('BEGIN IMMEDIATE');
      try{sqlite.exec(migration);sqlite.prepare('INSERT INTO test_schema_migrations(version) VALUES(?)').run(version);sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    });
  }
  const statement=(query,bindings=[])=>({
    bind(...values) { return statement(query,values); },
    async first(column) { const row=sqlite.prepare(query).get(...bindings); return column?(row?.[column]??null):(row?{...row}:null); },
    async all() { return {success:true,results:sqlite.prepare(query).all(...bindings).map(row=>({...row})),meta:{changes:0}}; },
    _run() {
      // D1 reports total_changes() delta, including triggers and cascades.
      const before=sqlite.prepare('SELECT total_changes() AS n').get().n;
      const result=sqlite.prepare(query).run(...bindings);
      const after=sqlite.prepare('SELECT total_changes() AS n').get().n;
      return {success:true,results:[],meta:{changes:Number(after-before),last_row_id:Number(result.lastInsertRowid)}};
    },
    async run() { return this._run(); },
  });
  return {
    sqlite,
    prepare:query=>statement(query),
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results=statements.map(item=>item._run()); sqlite.exec('COMMIT'); return results; }
      catch(error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    async exec(query) { sqlite.exec(query); return {count:0,duration:0}; },
    close() { sqlite.close(); },
  };
}
