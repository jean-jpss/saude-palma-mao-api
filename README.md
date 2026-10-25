# API SaÃºde na Palma da MÃ£o

API REST do Projeto Integrador "SaÃºde na Palma da MÃ£o" (Senac PE, 2026.2): prÃ©-triagem e agendamento de consultas no polo mÃ©dico do Recife. Esta Ã© a base da 1Âª entrega (26/10/2026).

- API publicada: https://saude-palma-mao-api.onrender.com
- DocumentaÃ§Ã£o interativa (Swagger): https://saude-palma-mao-api.onrender.com/docs
- EspecificaÃ§Ã£o OpenAPI: `/openapi.json`
- VerificaÃ§Ã£o de saÃºde: `/saude` (confirma API e banco)

> No plano gratuito do Render o serviÃ§o hiberna apÃ³s 15 minutos sem uso, e a primeira requisiÃ§Ã£o seguinte demora cerca de um minuto. Abra o `/saude` alguns minutos antes de qualquer demonstraÃ§Ã£o.

## RepositÃ³rios do projeto

| RepositÃ³rio | ConteÃºdo |
|---|---|
| saude-palma-mao-api (este) | Back-end Node.js |
| saude-na-palma-da-mao | Front-end (PWA) |
| RepositÃ³rio do banco | Scripts SQL (schema, seed e verificaÃ§Ã£o) |

## Stack

- Node.js 24 e Express 5
- PostgreSQL (driver `pg`, SQL parametrizado, sem ORM)
- AutenticaÃ§Ã£o com JWT (`jsonwebtoken`) e senhas com `bcryptjs`
- DocumentaÃ§Ã£o com `swagger-jsdoc` e `swagger-ui-express`
- Hospedagem: Render (API), Neon (banco) e Vercel (front)

## Arquitetura em camadas

src/
  servidor.js          ponto de entrada: middlewares globais, rotas e tratamento de erro
  swagger.js           configuração e schemas da documentação
  banco.js             pool de conexões e helper de transação
  erros.js             ErroApi e atalhos de erro
  validacao.js         validações de entrada (CPF, e-mail, datas, senha)
  validacaoCnpj.js     validação de CNPJ
  utilitarios.js       funções compartilhadas pelos controllers
  apresentadores.js    converte linhas do banco (snake_case) em JSON (camelCase)
  middlewares/         autenticar e exigePerfil
  routes/              caminho HTTP e middlewares de acesso, sem regra e sem SQL
  controllers/         validação, regras de negócio e códigos de status
  models/              única camada com SQL

## Como rodar localmente

Requisitos: Node.js 24 e um PostgreSQL 15 ou superior com o schema aplicado.

1. Crie o banco e rode, nesta ordem, `01-schema.sql` e `02-seed.sql` (repositÃ³rio do banco).
2. `npm install`
3. Crie um arquivo `.env` na raiz (nunca versione este arquivo):

```
DATABASE_URL=postgresql://usuario:senha@host:5432/banco
JWT_SEGREDO=uma-string-longa-e-aleatoria
JWT_EXPIRACAO=2h
ORIGENS_PERMITIDAS=http://localhost:5173
AMBIENTE=desenvolvimento
PORTA=3000
```

4. `npm run dev`
5. Abra `http://localhost:3000/docs` ou `http://localhost:3000/saude`.

| VariÃ¡vel | Para que serve |
|---|---|
| `DATABASE_URL` | String de conexÃ£o do PostgreSQL |
| `JWT_SEGREDO` | Segredo que assina os tokens (obrigatÃ³rio) |
| `JWT_EXPIRACAO` | Validade do token, padrÃ£o `2h` |
| `ORIGENS_PERMITIDAS` | Origens liberadas no CORS, separadas por vÃ­rgula (inclua o domÃ­nio da Vercel) |
| `AMBIENTE` | RÃ³tulo exibido no `/saude`. Use `producao` no Render |
| `PORTA` / `PORT` | Porta do servidor. O Render define `PORT` sozinho |

Gere um segredo de JWT com:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Deploy no Render

- Tipo: Web Service
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/saude`
- VariÃ¡veis de ambiente: as mesmas do `.env`, exceto `PORTA`

## AutenticaÃ§Ã£o e perfis

O login (`POST /autenticacao/login`) aceita e-mail ou CPF e devolve um token. Envie-o nas demais rotas no cabeÃ§alho `Authorization: Bearer <token>`. Existem trÃªs perfis: `PACIENTE`, `PROFISSIONAL` e `ADMINISTRADOR`.

O paciente se cadastra sozinho em `POST /autenticacao/cadastro`. Profissionais e clÃ­nicas sÃ£o cadastrados pelo administrador.

## Rotas

| MÃ©todo e rota | Perfil | FunÃ§Ã£o |
|---|---|---|
| `POST /autenticacao/cadastro` | pÃºblico | Cadastro de paciente |
| `POST /autenticacao/login` | pÃºblico | Login por e-mail ou CPF |
| `GET /autenticacao/eu` | logado | Dados do usuÃ¡rio logado |
| `GET /pacientes/eu` | paciente | Dados completos do paciente |
| `PATCH /pacientes/eu` | paciente | Atualiza os prÃ³prios dados (CPF nÃ£o muda) |
| `GET /pacientes?cpf=&nome=` | administrador | Consulta de pacientes |
| `GET /especialidades` | logado | Lista especialidades |
| `POST /especialidades`, `PATCH` e `DELETE /especialidades/:id` | administrador | ManutenÃ§Ã£o |
| `GET /clinicas`, `GET /clinicas/:id` | logado | Consulta de clÃ­nicas |
| `POST /clinicas`, `PATCH` e `DELETE /clinicas/:id`, `PUT /clinicas/:id/especialidades` | administrador | ManutenÃ§Ã£o |
| `GET /profissionais-clinicas?idEspecialidade=&idClinica=&nome=` | logado | Busca de profissionais, devolve o `idProfissionalClinica` |
| `GET`, `POST /profissionais`, `GET`, `PATCH`, `DELETE /profissionais/:id` | administrador | ManutenÃ§Ã£o de profissionais |
| `PUT /profissionais/:id/especialidades`, `POST /profissionais/:id/clinicas`, `DELETE /profissionais/:id/clinicas/:idClinica` | administrador | Especialidades e vÃ­nculos |
| `GET /disponibilidades?idProfissionalClinica=&data=` | logado | HorÃ¡rios livres de 30 minutos |
| `GET /disponibilidades/janelas`, `POST /disponibilidades`, `DELETE /disponibilidades/:id` | profissional ou administrador | Janelas de atendimento |
| `POST /agendamentos` | paciente | Marca consulta |
| `GET /agendamentos` | paciente | Lista os prÃ³prios agendamentos |
| `GET /agendamentos/:id` | logado | Detalhe (404 se for de outra pessoa) |
| `PATCH /agendamentos/:id/cancelamento` | paciente ou administrador | Cancela |
| `PATCH /agendamentos/:id/confirmacao` | profissional ou administrador | Confirma |
| `PATCH /agendamentos/:id/realizacao` | profissional ou administrador | Marca como realizada |
| `GET /agenda` | profissional ou administrador | Agenda do profissional |

A lista completa, com parÃ¢metros e exemplos de resposta, estÃ¡ no Swagger.

## Regras de negÃ³cio principais

- A agenda pertence ao vÃ­nculo entre profissional e clÃ­nica (`idProfissionalClinica`), e nÃ£o ao profissional. O mesmo mÃ©dico em duas clÃ­nicas tem duas agendas.
- HorÃ¡rios de 30 minutos, calculados a partir das janelas de disponibilidade.
- AntecedÃªncia mÃ­nima de 24 horas para marcar, e busca de horÃ¡rios em atÃ© 60 dias.
- Cancelamento pelo paciente com pelo menos 8 horas de antecedÃªncia.
- No mÃ¡ximo 5 agendamentos futuros ativos por paciente.
- NÃ£o hÃ¡ remarcaÃ§Ã£o: cancela e marca de novo.
- Dois Ã­ndices Ãºnicos parciais no banco impedem conflito mesmo com requisiÃ§Ãµes simultÃ¢neas: um por horÃ¡rio do profissional e outro por horÃ¡rio do paciente, considerando sÃ³ os status `AGENDADO` e `CONFIRMADO`.
- ExclusÃ£o lÃ³gica (campo `ativo`). NÃ£o Ã© possÃ­vel desativar clÃ­nica, profissional ou vÃ­nculo com consultas futuras ativas.
- Acessar o registro de outra pessoa retorna 404, e nÃ£o 403.
- Datas trafegam em UTC e as janelas de atendimento sÃ£o interpretadas no fuso `America/Recife`.

Status do agendamento: `AGENDADO`, `CONFIRMADO`, `CANCELADO`, `REALIZADO`.

## PadrÃ£o de erro

```json
{ "erro": { "codigo": "HORARIO_INDISPONIVEL", "mensagem": "..." } }
```

## ConvenÃ§Ãµes

- Banco em `snake_case`, JSON da API em `camelCase`
- Identificadores, rotas e colunas sem acento e sem cedilha
- Rotas no plural
- Texto exibido ao usuÃ¡rio com acentuaÃ§Ã£o normal

## Contas de demonstraÃ§Ã£o

O `02-seed.sql` cria contas fictÃ­cias apenas para testes e demonstraÃ§Ã£o: um administrador, profissionais com e-mail `@exemplo.test` e a senha padrÃ£o do seed. As senhas estÃ£o no prÃ³prio seed e no Swagger. Antes de qualquer uso real, troque ou remova essas contas.

## Equipe

Arthur Andrey, Ibson Gomes, Gabriel Roberto, Jean Phillip, JoÃ£o Santino e Layza Maria.

## Testes

Roteiro de testes manuais em PowerShell: [TESTES.md](TESTES.md). Cobre hoje a autenticação. Os demais fluxos podem ser exercitados pelo Swagger em `/docs`.

