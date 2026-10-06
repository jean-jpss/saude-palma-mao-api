// =====================================================================
// ROUTES: autenticacao
//
// A camada de rotas so faz uma coisa: ligar um caminho HTTP a um
// controller, declarando os middlewares que rodam antes. Nenhuma
// regra, nenhuma validacao, nenhum SQL.
//
// A vantagem: este arquivo e um indice legivel da API. Quem quiser
// saber o que existe olha aqui, sem ler implementacao.
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/autenticacaoController.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

rotas.post('/cadastro', controller.cadastrar);
rotas.post('/login', controller.entrar);
rotas.get('/eu', autenticar, controller.meuPerfil);

export default rotas;
