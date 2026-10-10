# API Saúde na Palma da Mão

API REST do Projeto Integrador "Saúde na Palma da Mão" (Senac PE, 2026.2): pré-triagem e agendamento de consultas no polo médico do Recife. Esta é a base da 1ª entrega (26/10/2026).

- API publicada: https://saude-palma-mao-api.onrender.com
- Documentação interativa (Swagger): https://saude-palma-mao-api.onrender.com/docs
- Especificação OpenAPI: `/openapi.json`
- Verificação de saúde: `/saude` (confirma API e banco)

> No plano gratuito do Render o serviço hiberna após 15 minutos sem uso, e a primeira requisição seguinte demora cerca de um minuto. Abra o `/saude` alguns minutos antes de qualquer demonstração.

## Repositórios do projeto

| Repositório | Conteúdo |
|---|---|
| saude-palma-mao-api (este) | Back-end Node.js |
| saude-na-palma-da-mao | Front-end (PWA) |
| Repositório do banco | Scripts SQL (schema, seed e verificação) |

## Stack

- Node.js 24 e Express 5
- PostgreSQL (driver `pg`, SQL parametrizado, sem ORM)
- Autenticação com JWT (`jsonwebtoken`) e senhas com `bcryptjs`
- Documentação com `swagger-jsdoc` e `swagger-ui-express`
- Hospedagem: Render (API), Neon (banco) e Vercel (front)

## Arquitetura em camadas

```
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
```

Regra que mantém a separação: um controller nunca escreve SQL, e um model nunca conhece requisição ou resposta HTTP.

## Como rodar localmente

Requisitos: Node.js 24 e um PostgreSQL 15 ou superior com o schema aplicado.

1. Crie o banco e rode, nesta ordem, `01-schema.sql` e `02-seed.sql` (repositório do banco).
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

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SEGREDO` | Segredo que assina os tokens (obrigatório) |
| `JWT_EXPIRACAO` | Validade do token, padrão `2h` |
| `ORIGENS_PERMITIDAS` | Origens liberadas no CORS, separadas por vírgula (inclua o domínio da Vercel) |
| `AMBIENTE` | Rótulo exibido no `/saude`. Use `producao` no Render |
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
- Variáveis de ambiente: as mesmas do `.env`, exceto `PORTA`

## Autenticação e perfis

O login (`POST /autenticacao/login`) aceita e-mail ou CPF e devolve um token. Envie-o nas demais rotas no cabeçalho `Authorization: Bearer <token>`. Existem três perfis: `PACIENTE`, `PROFISSIONAL` e `ADMINISTRADOR`.

O paciente se cadastra sozinho em `POST /autenticacao/cadastro`. Profissionais e clínicas são cadastrados pelo administrador.

## Rotas

| Método e rota | Perfil | Função |
|---|---|---|
| `POST /autenticacao/cadastro` | público | Cadastro de paciente |
| `POST /autenticacao/login` | público | Login por e-mail ou CPF |
| `GET /autenticacao/eu` | logado | Dados do usuário logado |
| `GET /pacientes/eu` | paciente | Dados completos do paciente |
| `PATCH /pacientes/eu` | paciente | Atualiza os próprios dados (CPF não muda) |
| `GET /pacientes?cpf=&nome=` | administrador | Consulta de pacientes |
| `GET /especialidades` | logado | Lista especialidades |
| `POST /especialidades`, `PATCH` e `DELETE /especialidades/:id` | administrador | Manutenção |
| `GET /clinicas`, `GET /clinicas/:id` | logado | Consulta de clínicas |
| `POST /clinicas`, `PATCH` e `DELETE /clinicas/:id`, `PUT /clinicas/:id/especialidades` | administrador | Manutenção |
| `GET /profissionais-clinicas?idEspecialidade=&idClinica=&nome=` | logado | Busca de profissionais, devolve o `idProfissionalClinica` |
| `GET`, `POST /profissionais`, `GET`, `PATCH`, `DELETE /profissionais/:id` | administrador | Manutenção de profissionais |
| `PUT /profissionais/:id/especialidades`, `POST /profissionais/:id/clinicas`, `DELETE /profissionais/:id/clinicas/:idClinica` | administrador | Especialidades e vínculos |
| `GET /disponibilidades?idProfissionalClinica=&data=` | logado | Horários livres de 30 minutos |
| `GET /disponibilidades/janelas`, `POST /disponibilidades`, `DELETE /disponibilidades/:id` | profissional ou administrador | Janelas de atendimento |
| `POST /agendamentos` | paciente | Marca consulta |
| `GET /agendamentos` | paciente | Lista os próprios agendamentos |
| `GET /agendamentos/:id` | logado | Detalhe (404 se for de outra pessoa) |
| `PATCH /agendamentos/:id/cancelamento` | paciente ou administrador | Cancela |
| `PATCH /agendamentos/:id/confirmacao` | profissional ou administrador | Confirma |
| `PATCH /agendamentos/:id/realizacao` | profissional ou administrador | Marca como realizada |
| `GET /agenda` | profissional ou administrador | Agenda do profissional |

A lista completa, com parâmetros e exemplos de resposta, está no Swagger.

## Regras de negócio principais

- A agenda pertence ao vínculo entre profissional e clínica (`idProfissionalClinica`), e não ao profissional. O mesmo médico em duas clínicas tem duas agendas.
- Horários de 30 minutos, calculados a partir das janelas de disponibilidade.
- Antecedência mínima de 24 horas para marcar, e busca de horários em até 60 dias.
- Cancelamento pelo paciente com pelo menos 8 horas de antecedência.
- No máximo 5 agendamentos futuros ativos por paciente.
- Não há remarcação: cancela e marca de novo.
- Dois índices únicos parciais no banco impedem conflito mesmo com requisições simultâneas: um por horário do profissional e outro por horário do paciente, considerando só os status `AGENDADO` e `CONFIRMADO`.
- Exclusão lógica (campo `ativo`). Não é possível desativar clínica, profissional ou vínculo com consultas futuras ativas.
- Acessar o registro de outra pessoa retorna 404, e não 403.
- Datas trafegam em UTC e as janelas de atendimento são interpretadas no fuso `America/Recife`.

Status do agendamento: `AGENDADO`, `CONFIRMADO`, `CANCELADO`, `REALIZADO`.

## Padrão de erro

```json
{ "erro": { "codigo": "HORARIO_INDISPONIVEL", "mensagem": "..." } }
```

## Convenções

- Banco em `snake_case`, JSON da API em `camelCase`
- Identificadores, rotas e colunas sem acento e sem cedilha
- Rotas no plural
- Texto exibido ao usuário com acentuação normal

## Contas de demonstração

O `02-seed.sql` cria contas fictícias apenas para testes e demonstração: um administrador, profissionais com e-mail `@exemplo.test` e a senha padrão do seed. As senhas estão no próprio seed e no Swagger. Antes de qualquer uso real, troque ou remova essas contas.

## Equipe

Arthur Andrey, Ibson Gomes, Gabriel Roberto, Jean Phillip, João Santino e Layza Maria.

## Testes

Roteiro de testes manuais em PowerShell: [TESTES.md](TESTES.md). Cobre hoje a autentica��o. Os demais fluxos podem ser exercitados pelo Swagger em `/docs`.

