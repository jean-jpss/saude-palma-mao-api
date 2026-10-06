// =====================================================================
// ROUTES: disponibilidade
//
// A ordem aqui importa: "/janelas" precisa vir antes de "/:id", senao
// a palavra "janelas" seria capturada como se fosse um identificador.
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/disponibilidadeController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

const profissionalOuAdmin = [autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR')];

rotas.get('/', autenticar, controller.listarHorarios);
rotas.get('/janelas', profissionalOuAdmin, controller.listarJanelas);
rotas.post('/', profissionalOuAdmin, controller.criar);
rotas.delete('/:id', profissionalOuAdmin, controller.desativar);

export default rotas;
