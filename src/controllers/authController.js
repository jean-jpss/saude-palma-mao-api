import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { consultar } from '../config/banco.js'; 

class authController {

    async registrar(req, res) {
        const { nome, email, senha, telefone, tipo_usuario } = req.body;

        try {
            const emailExiste = await consultar('SELECT * FROM usuario WHERE email = $1', [email]);
            if (emailExiste.rows.length > 0) {
                return res.status(400).json({ erro: 'Este email já está cadastrado.' });
            }

            const salt = await bcrypt.genSalt(10);
            const senhaHash = await bcrypt.hash(senha, salt);

            const comando = `
                INSERT INTO usuario (nome, email, senha_hash, telefone, tipo_usuario) 
                VALUES ($1, $2, $3, $4, $5) 
                RETURNING id_usuario, nome, email, tipo_usuario;
            `;
            const valores = [nome, email, senhaHash, telefone, tipo_usuario];
            
            const resultado = await consultar(comando, valores);
            res.status(201).json({ mensagem: 'Usuário criado com sucesso!', usuario: resultado.rows[0] });

        } catch (erro) {
            console.error(erro);
            res.status(500).json({ erro: 'Erro ao registrar usuário.' });
        }
    }

    async login(req, res) {
        const { email, senha } = req.body;

        try {
            const resultado = await consultar('SELECT * FROM usuario WHERE email = $1 AND ativo = TRUE', [email]);
            const usuario = resultado.rows[0];

            if (!usuario) {
                return res.status(401).json({ erro: 'Email ou senha inválidos.' });
            }

            const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
            if (!senhaCorreta) {
                return res.status(401).json({ erro: 'Email ou senha inválidos.' });
            }

            const segredo = process.env.JWT_SECRET; 
            const token = jwt.sign(
                { id: usuario.id_usuario, tipo: usuario.tipo_usuario }, 
                segredo, 
                { expiresIn: '1d' }
            );

            res.json({
                mensagem: 'Login efetuado com sucesso!',
                token: token,
                usuario: {
                    id_usuario: usuario.id_usuario,
                    nome: usuario.nome,
                    email: usuario.email,
                    tipo_usuario: usuario.tipo_usuario
                }
            });

        } catch (erro) {
            console.error(erro);
            res.status(500).json({ erro: 'Erro ao fazer login.' });
        }
    }
}

export default new authController();