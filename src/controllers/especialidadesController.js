import { consultar } from '../config/banco.js'; 

class especialidadesController {

    async listar(req, res) {
        try {
            const resultado = await consultar('SELECT * FROM especialidade WHERE ativo = TRUE');
            res.json(resultado.rows);
        } catch (erro) {
            console.error(erro);
            res.status(500).json({ erro: 'Erro ao buscar especialidades no banco de dados' });
        }
    }

    async criar(req, res) {
        const { nome, descricao } = req.body;
        try {
            const comando = 'INSERT INTO especialidade (nome, descricao) VALUES ($1, $2) RETURNING *';
            const valores = [nome, descricao];
            
            const resultado = await consultar(comando, valores);
            res.status(201).json(resultado.rows[0]);
        } catch (erro) {
            console.error(erro);
            res.status(500).json({ erro: 'Erro ao criar especialidade' });
        }
    }
}

export default new especialidadesController();