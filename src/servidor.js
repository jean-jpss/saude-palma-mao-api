// =====================================================================
// SERVIDOR
//
// Ponto de entrada da aplicacao. Monta o Express, registra os
// middlewares globais, liga cada prefixo de URL ao seu arquivo de
// rotas e define o tratamento de erro.
//
// Arquitetura em camadas:
//
//   routes       caminho HTTP e middlewares de acesso
//   controllers  leitura da requisicao, validacao e resposta
//   models       acesso ao banco, o unico lugar com SQL
//
// A regra que mantem a separacao: um controller nunca escreve SQL, e
// um model nunca conhece requisicao ou resposta HTTP.
// =====================================================================
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import { consultar } from './banco.js';
import { especificacaoSwagger } from './swagger.js';

import rotasAutenticacao from './routes/autenticacaoRoutes.js';
import rotasEspecialidades from './routes/especialidadeRoutes.js';
import rotasClinicas from './routes/clinicaRoutes.js';
import rotasProfissionais from './routes/profissionalRoutes.js';
import rotasProfissionaisClinicas from './routes/profissionalClinicaRoutes.js';
import rotasDisponibilidades from './routes/disponibilidadeRoutes.js';
import rotasAgendamentos from './routes/agendamentoRoutes.js';
import rotasAgenda from './routes/agendaRoutes.js';
import rotasPacientes from './routes/pacienteRoutes.js';

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
// Documentacao interativa da API
//
// A especificacao e montada a partir das anotacoes JSDoc nos arquivos
// de src/routes, somadas aos schemas definidos em swagger.js.
//
// /docs        interface navegavel
// /openapi.json  especificacao bruta, para gerar cliente ou importar
//                no Postman e no Insomnia
// ---------------------------------------------------------------
app.use('/docs', swaggerUi.serve, swaggerUi.setup(especificacaoSwagger, {
    customSiteTitle: 'API Saude na Palma da Mao',
    swaggerOptions: {
        // Mantem o token preenchido ao recarregar a pagina.
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true
    }
}));

app.get('/openapi.json', (_requisicao, resposta) => {
    resposta.json(especificacaoSwagger);
});

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
            horaServidor: rows[0].agora,
            documentacao: '/docs'
        });
    } catch (erro) {
        console.error('Falha no health check:', erro);
        resposta.status(503).json({
            erro: { codigo: 'BANCO_INDISPONIVEL', mensagem: 'Nao foi possivel conectar ao banco de dados.' }
        });
    }
});

// Rota raiz: evita a impressao de erro quando alguem abre a URL base.
app.get('/', (_requisicao, resposta) => {
    resposta.json({
        api: 'Saude na Palma da Mao',
        versao: '1.0.0',
        documentacao: '/docs',
        especificacao: '/openapi.json',
        saude: '/saude'
    });
});

// ---------------------------------------------------------------
// Rotas do dominio
// ---------------------------------------------------------------
app.use('/autenticacao', rotasAutenticacao);
app.use('/pacientes', rotasPacientes);
app.use('/especialidades', rotasEspecialidades);
app.use('/clinicas', rotasClinicas);
app.use('/profissionais-clinicas', rotasProfissionaisClinicas);
app.use('/profissionais', rotasProfissionais);
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

    // Erro previsto (ErroApi) nao polui o log: ja foi tratado de
    // proposito. Erro inesperado vai inteiro para o log.
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
    console.log(`Documentacao em http://localhost:${PORTA}/docs`);
});
