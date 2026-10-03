import express from 'express';
import especialidadesController from '../controllers/especialidadesController.js';

const router = express.Router();

router.get('/', especialidadesController.listar);
router.post('/', especialidadesController.criar);

export default router;