import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { consultar } from './banco.js';
import rotasAutenticacao from './rotas/autenticacao.js';
import rotasEspecialidades from './rotas/especialidades.js';
import rotasProfissionaisClinicas from './rotas/profissionaisClinicas.js';
import rotasDisponibilidades from './rotas/disponibilidades.js';
import rotasAgendamentos from './rotas/agendamentos.js';
import rotasAgenda from './rotas/agenda.js';

const app = express();
const PORTA = process.env.PORT || process.env.PORTA || 3000;

if (!process.env.JWT_SEGREDO) {
    throw new Error('Variavel de ambiente JWT_SEGREDO nao definida.');
}

const origensPermitidas = (process.env.ORIGENS_PERMITIDAS || '')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean);

app.use(cors({
    origin(origem, retorno) {
        // Requisicoes sem origem (Postman, curl, testes) sao liberadas.
        if (!origem || origensPermitidas.includes(origem)) {
            return retorno(null, true);
        }
        return retorno(new Error(`Origem nao autorizada: ${origem}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ---------------------------------------------------------------
// Health check. E o endpoint que prova que API e banco estao no ar.
// ---------------------------------------------------------------
app.get('/saude', async (_requisicao, resposta) => {
    try {
        const { rows } = await consultar('SELECT NOW() AS agora');
        resposta.json({
            status: 'ok',
            ambiente: process.env.AMBIENTE || 'desconhecido',
            banco: 'conectado',
            horaServidor: rows[0].agora
        });
    } catch (erro) {
        console.error('Falha no health check:', erro);
        resposta.status(503).json({
            erro: { codigo: 'BANCO_INDISPONIVEL', mensagem: 'Nao foi possivel conectar ao banco de dados.' }
        });
    }
});

// ---------------------------------------------------------------
// Rotas do dominio
// ---------------------------------------------------------------
app.use('/autenticacao', rotasAutenticacao);
app.use('/especialidades', rotasEspecialidades);
app.use('/profissionais-clinicas', rotasProfissionaisClinicas);
app.use('/disponibilidades', rotasDisponibilidades);
app.use('/agendamentos', rotasAgendamentos);
app.use('/agenda', rotasAgenda);

// 404 padronizado. Precisa vir depois de todas as rotas.
app.use((requisicao, resposta) => {
    resposta.status(404).json({
        erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: `Rota ${requisicao.method} ${requisicao.path} nao existe.` }
    });
});

// Tratamento global de erro. Todo erro da aplicacao sai neste formato.
app.use((erro, _requisicao, resposta, _proximo) => {
    const status = erro.status || 500;

    // Erro previsto (ErroApi) nao polui o log: ja foi tratado de proposito.
    // Erro inesperado vai inteiro para o log, para permitir diagnostico.
    if (status >= 500) {
        console.error(erro);
    }

    resposta.status(status).json({
        erro: {
            codigo: erro.codigo || 'ERRO_INTERNO',
            mensagem: status >= 500 ? 'Erro interno do servidor.' : erro.message
        }
    });
});

app.listen(PORTA, () => {
    console.log(`API ouvindo na porta ${PORTA}`);
});