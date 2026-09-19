import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('Variavel de ambiente DATABASE_URL nao definida.');
}

// Provedores gerenciados (Neon, Supabase, Render) exigem TLS.
// Postgres local nao aceita TLS, por isso a deteccao por localhost.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000
});

export function consultar(texto, parametros) {
  return pool.query(texto, parametros);
}