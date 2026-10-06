# Reestruturação em camadas: models, controllers e routes

Refatoração solicitada pelo professor. O comportamento da API não muda: as mesmas rotas, os mesmos parâmetros, as mesmas respostas e os mesmos códigos de erro. O que muda é a organização interna do código.

## 1. O problema que existia

Cada arquivo em `src/rotas/` fazia três coisas ao mesmo tempo:

1. Declarava o caminho HTTP e quem pode acessá-lo
2. Lia e validava a entrada, decidia o código de status
3. Escrevia e executava SQL

Isso funciona, mas tem três custos práticos. Uma consulta usada em dois lugares aparece duplicada. Qualquer mudança no banco exige procurar SQL espalhado por vários arquivos. E um arquivo de 400 linhas dificulta que duas pessoas trabalhem em paralelo sem conflito.

## 2. A estrutura nova

```
src/
  servidor.js              monta o Express e liga os prefixos às rotas
  banco.js                 conexão e transações
  erros.js                 classe de erro do domínio
  validacao.js             validações de CPF, e-mail, data, senha
  validacaoCnpj.js         validação de CNPJ
  apresentadores.js        converte linha do banco em objeto da API
  utilitarios.js           funções auxiliares dos controllers

  middlewares/
    autenticacao.js        verifica o token e o perfil

  models/                  ÚNICA camada que conhece SQL
    usuarioModel.js
    pacienteModel.js
    especialidadeModel.js
    clinicaModel.js
    profissionalModel.js
    disponibilidadeModel.js
    agendamentoModel.js

  controllers/             lê a requisição, valida, responde
    autenticacaoController.js
    especialidadeController.js
    clinicaController.js
    profissionalController.js
    profissionalClinicaController.js
    disponibilidadeController.js
    agendamentoController.js
    agendaController.js

  routes/                  só liga caminho a controller
    autenticacaoRoutes.js
    especialidadeRoutes.js
    clinicaRoutes.js
    profissionalRoutes.js
    profissionalClinicaRoutes.js
    disponibilidadeRoutes.js
    agendamentoRoutes.js
    agendaRoutes.js
```

A pasta `src/rotas/` deixa de existir, substituída por `src/routes/`.

## 3. A regra que mantém a separação

Duas frases resumem a arquitetura e servem de resposta se o professor perguntar:

**Um controller nunca escreve SQL.** Se precisar de dado, chama um model.

**Um model nunca conhece requisição ou resposta HTTP.** Ele não sabe o que é um código 404, não lê `req.body` e não chama `res.json`. Recebe valores, consulta o banco, devolve linhas.

Consequência prática: se o banco mudasse de PostgreSQL para outro SGBD, apenas a pasta `models` precisaria ser reescrita. Se a API virasse GraphQL em vez de REST, apenas `routes` e `controllers` mudariam.

## 4. Responsabilidade de cada camada

| Camada | Faz | Não faz |
| --- | --- | --- |
| routes | declara o caminho, o método HTTP e os middlewares de acesso | validação, regra de negócio, SQL |
| controllers | lê a requisição, valida a entrada, aplica a regra de negócio, escolhe o código de status, monta a resposta | SQL |
| models | monta e executa as consultas, administra transações | validação de entrada, decisão de status HTTP |

Dois arquivos de apoio completam a separação:

**apresentadores.js** converte a linha do banco, em `snake_case`, no objeto da API, em `camelCase`. Isolar essa tradução em um lugar só garante que a API responda sempre no mesmo formato, e evita repetir a mesma conversão em vários controllers.

**utilitarios.js** reúne funções que vários controllers usam: validação de identificador, normalização de hora, concordância de número nas mensagens.

## 5. Como instalar

**Importante:** esta é uma substituição completa da pasta `src/`. Não copie arquivo por arquivo sobre a estrutura antiga, porque sobrariam os arquivos de `src/rotas/`, que não são mais usados.

Passo a passo:

1. Pare o servidor com `Ctrl` + `C`
2. Guarde uma cópia da pasta atual, por segurança:
   ```powershell
   Copy-Item src src_antigo -Recurse
   ```
3. Apague a pasta `src` inteira:
   ```powershell
   Remove-Item src -Recurse
   ```
4. Copie a pasta `src` nova para a raiz do projeto
5. Confirme a estrutura:
   ```powershell
   ls src
   ls src\models
   ls src\controllers
   ls src\routes
   ```
6. Rode:
   ```powershell
   npm run dev
   ```

Nada muda no `package.json`, no `.env` ou no banco de dados. O ponto de entrada continua sendo `src/servidor.js`.

Depois de confirmar que tudo funciona, apague a cópia:

```powershell
Remove-Item src_antigo -Recurse
```

## 6. Verificação

O comportamento precisa ser idêntico ao de antes. Teste o fluxo principal:

```powershell
$api = "http://localhost:3000"

# Health check
Invoke-RestMethod -Uri "$api/saude"

# Login do paciente
$login = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $login -ContentType "application/json"
$cab = @{ Authorization = "Bearer $($r.token)" }

# Consultas de leitura
(Invoke-RestMethod -Uri "$api/especialidades" -Headers $cab).Count
(Invoke-RestMethod -Uri "$api/clinicas" -Headers $cab).Count
(Invoke-RestMethod -Uri "$api/profissionais-clinicas" -Headers $cab).Count

# Horários e agendamento
$h = (Invoke-RestMethod -Uri "$api/disponibilidades?idProfissionalClinica=3&data=2026-10-22" -Headers $cab).horarios
$h.Count

$novo = @{ idProfissionalClinica = 3; idEspecialidade = 3; dataHora = $h[0].dataHora } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/agendamentos" -Method Post -Body $novo -ContentType "application/json" -Headers $cab | ConvertTo-Json -Depth 2

# Agenda do profissional
$lp = @{ identificador = "carlos.lima@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$rp = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $lp -ContentType "application/json"
$prof = @{ Authorization = "Bearer $($rp.token)" }
(Invoke-RestMethod -Uri "$api/agenda" -Headers $prof).Count

# Área administrativa
$la = @{ identificador = "admin@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$ra = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $la -ContentType "application/json"
$adm = @{ Authorization = "Bearer $($ra.token)" }
(Invoke-RestMethod -Uri "$api/profissionais" -Headers $adm).Count
```

Se todos responderem como antes, a refatoração está correta.

## 7. Uma correção aproveitada

As mensagens de bloqueio exibiam "Existem 1 consultas marcadas". A concordância agora é tratada por uma função única em `utilitarios.js`, usada por todos os controllers que informam quantidade. O defeito estava em clínicas, especialidades e profissionais.

## 8. Nome das pastas

Usei `models`, `controllers` e `routes` em inglês, que é a convenção do padrão MVC e foi como o professor nomeou. O conteúdo dos arquivos continua em português, seguindo a convenção do projeto.

Se o grupo preferir tudo em português, o ajuste é renomear as três pastas e corrigir os caminhos nos `import`. São cerca de trinta linhas, concentradas no `servidor.js` e no topo de cada arquivo.

## 9. O que explicar na apresentação

A separação em camadas é uma aplicação do princípio de responsabilidade única: cada arquivo tem um motivo para mudar, e apenas um.

Um exemplo concreto do projeto: a consulta que gera os horários livres a partir das janelas de atendimento. Antes ela existia dentro do arquivo de rota. Agora está em `disponibilidadeModel.js`, e o controller apenas valida os parâmetros e chama a função. Se a regra de geração de horários mudar, há um único lugar a alterar, e o controller nem toma conhecimento.

Outro exemplo: o cadastro de profissional grava em três tabelas dentro de uma transação. Essa transação vive em `profissionalModel.js`. O controller sabe que precisa criar um profissional, não sabe que isso envolve três `INSERT`.
