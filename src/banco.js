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

// ---------------------------------------------------------------------
// Transacao: varios comandos que precisam valer como uma operacao so.
//
// No cadastro de paciente, por exemplo, sao dois INSERT: um em usuario
// e outro em paciente. Se o segundo falhar e o primeiro ja tiver sido
// gravado, fica um usuario orfao que nunca consegue fazer login nem
// recadastrar, porque o e-mail ja estaria ocupado.
//
// A transacao garante tudo ou nada: COMMIT no sucesso, ROLLBACK no erro.
// ---------------------------------------------------------------------
export async function transacao(callback) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const resultado = await callback(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
    } finally {
        // Devolve a conexao ao pool. Sem isso o pool esgota em poucas
        // requisicoes e a aplicacao trava esperando conexao livre.
        cliente.release();
    }
}
