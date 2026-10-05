# P4b: cadastro de profissionais

Requisito 2 da 1a entrega. Fecha a P4 e o backend da entrega.

## 1. Copiar o arquivo

`profissionais.js` vai para `src/rotas/`. Arquivo novo, nao substitui
nada. Nao confundir com `profissionaisClinicas.js`, que ja existe e e
a busca do paciente.

## 2. Registrar no servidor.js

Import, no topo:

```javascript
import rotasProfissionais from './rotas/profissionais.js';
```

Rota, junto das outras:

```javascript
app.use('/profissionais', rotasProfissionais);
```

Conferir:

```powershell
Select-String -Path src\servidor.js -Pattern "rotasProfissionais"
```

Esperado: duas linhas.

Atencao: ja existe `app.use('/profissionais-clinicas', ...)`. Sao
caminhos diferentes e nao conflitam, porque o Express casa o prefixo
inteiro, nao um pedaco dele.

## 3. Rotas

| Metodo e rota | O que faz |
| --- | --- |
| `GET /profissionais` | lista, com busca por nome ou registro |
| `GET /profissionais/:id` | detalhe, com vinculos |
| `POST /profissionais` | cadastra usuario, profissional e vinculos |
| `PATCH /profissionais/:id` | altera dados cadastrais |
| `PUT /profissionais/:id/especialidades` | substitui a lista |
| `POST /profissionais/:id/clinicas` | acrescenta um vinculo |
| `DELETE /profissionais/:id/clinicas/:idClinica` | desativa um vinculo |
| `DELETE /profissionais/:id` | desativa o profissional |

Todas exigem perfil administrador.

## 4. Testes

```powershell
$api = "http://localhost:3000"

$loginAdm = @{ identificador = "admin@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$ra = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginAdm -ContentType "application/json"
$adm = @{ Authorization = "Bearer $($ra.token)" }
```

### 4.1 Listar

```powershell
Invoke-RestMethod -Uri "$api/profissionais" -Headers $adm | ConvertTo-Json -Depth 4
```

Esperado: os 6 do seed, cada um com suas especialidades e clinicas.
Ana Beatriz e Marcos Vinicius aparecem com duas clinicas cada.

### 4.2 Cadastrar

```powershell
$novo = @{
  nome = "Patricia Nunes Moreira"
  email = "patricia.moreira@exemplo.test"
  telefone = "81988889999"
  cpf = "84573245000"
  conselho = "CRM"
  registroProfissional = "10007"
  ufRegistro = "PE"
  senha = "senhaInicial123"
  idsEspecialidades = @(1, 2)
  idsClinicas = @(1)
} | ConvertTo-Json

Invoke-RestMethod -Uri "$api/profissionais" -Method Post -Body $novo -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 4
```

Esperado: HTTP 201, com `registro` "CRM-PE 10007", duas especialidades
e uma clinica, ja com `idProfissionalClinica` gerado.

Uma requisicao criou tres coisas: o usuario de acesso, o registro
profissional e os vinculos.

### 4.3 A profissional nova consegue entrar

```powershell
$loginNovo = @{ identificador = "patricia.moreira@exemplo.test"; senha = "senhaInicial123" } | ConvertTo-Json
$rn = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginNovo -ContentType "application/json"
$rn.usuario | ConvertTo-Json
```

Esperado: `tipoUsuario` PROFISSIONAL, com `idProfissional` preenchido.

Isso prova que a transacao criou o usuario corretamente, com a senha
definida pelo administrador.

### 4.4 Ela aparece na busca do paciente

```powershell
$loginPac = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json
$rp = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginPac -ContentType "application/json"
$pac = @{ Authorization = "Bearer $($rp.token)" }

Invoke-RestMethod -Uri "$api/profissionais-clinicas?idEspecialidade=2" -Headers $pac |
  ForEach-Object { [pscustomobject]@{ id = $_.idProfissionalClinica; nome = $_.nome } } | Format-Table
```

Cardiologia. Esperado: Ana Beatriz, nas duas clinicas, mais Patricia.
O ciclo fecha: o administrador cadastra, o paciente encontra.

### 4.5 CPF invalido

```powershell
$ruim = $novo | ConvertFrom-Json
$ruim.cpf = "11111111111"
$ruim.email = "outro@exemplo.test"
Invoke-RestMethod -Uri "$api/profissionais" -Method Post -Body ($ruim | ConvertTo-Json) -ContentType "application/json" -Headers $adm
```

Esperado: `DADOS_INVALIDOS`, HTTP 400.

### 4.6 E-mail duplicado

Repita o comando do item 4.2.
Esperado: `EMAIL_JA_CADASTRADO`, HTTP 409.

Importante: confira que nenhum profissional orfao foi criado.

```powershell
(Invoke-RestMethod -Uri "$api/profissionais" -Headers $adm).Count
```

Esperado: 7, nao 8. A transacao desfez tudo.

### 4.7 Registro duplicado

```powershell
$mesmoRegistro = @{
  nome = "Outro Profissional"
  email = "outro.prof@exemplo.test"
  cpf = "27845123006"
  conselho = "CRM"
  registroProfissional = "10007"
  ufRegistro = "PE"
  senha = "senhaInicial123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$api/profissionais" -Method Post -Body $mesmoRegistro -ContentType "application/json" -Headers $adm
```

Esperado: `REGISTRO_JA_CADASTRADO`, HTTP 409. O mesmo CRM-PE 10007 nao
pode pertencer a duas pessoas.

### 4.8 Conselho invalido

```powershell
$conselhoRuim = @{
  nome = "Teste Conselho"; email = "teste.conselho@exemplo.test"; cpf = "27845123006"
  conselho = "XYZ"; registroProfissional = "99999"; ufRegistro = "PE"; senha = "senhaInicial123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$api/profissionais" -Method Post -Body $conselhoRuim -ContentType "application/json" -Headers $adm
```

Esperado: `DADOS_INVALIDOS`, listando os conselhos aceitos.

### 4.9 Alterar dados

```powershell
$id = 7
$mudar = @{ telefone = "81977776666"; nome = "Patricia Nunes Moreira Silva" } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/profissionais/$id" -Method Patch -Body $mudar -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 3
```

Nome e telefone moram em `usuario`, conselho e registro em
`profissional`. A tela e uma so, a atualizacao e em duas tabelas.

### 4.10 Senha nao se altera por aqui

```powershell
$tentativa = @{ senha = "novaSenha123" } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/profissionais/$id" -Method Patch -Body $tentativa -ContentType "application/json" -Headers $adm
```

Esperado: `DADOS_INVALIDOS`. Trocar senha de outra pessoa e operacao
distinta, com risco distinto, e nao deve acontecer por engano numa
edicao de cadastro.

### 4.11 Acrescentar clinica

```powershell
$vinculo = @{ idClinica = 2 } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/profissionais/$id/clinicas" -Method Post -Body $vinculo -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 3
```

Esperado: duas clinicas, cada uma com seu `idProfissionalClinica`.
Agendas separadas.

### 4.12 Vinculo repetido

Repita o comando acima.
Esperado: `VINCULO_JA_EXISTE`, HTTP 409.

### 4.13 Substituir especialidades

```powershell
$esp = @{ idsEspecialidades = @(2, 8) } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/profissionais/$id/especialidades" -Method Put -Body $esp -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 3
```

Esperado: Cardiologia e Geriatria. Clinica Geral saiu.

### 4.14 Desativar vinculo

```powershell
Invoke-RestMethod -Uri "$api/profissionais/$id/clinicas/2" -Method Delete -Headers $adm
```

Esperado: HTTP 204, sem saida.

### 4.15 Desativar profissional sem agendamentos

```powershell
Invoke-RestMethod -Uri "$api/profissionais/$id" -Method Delete -Headers $adm
```

Esperado: HTTP 204.

Confirme que ela perdeu o acesso:

```powershell
Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginNovo -ContentType "application/json"
```

Esperado: `USUARIO_INATIVO`, HTTP 403. Desativar o profissional
desativa tambem o usuario de acesso.

### 4.16 Desativar profissional com agendamentos

```powershell
Invoke-RestMethod -Uri "$api/profissionais/2" -Method Delete -Headers $adm
```

O id 2 e o Carlos, que tem consultas futuras dos testes anteriores.
Esperado: `PROFISSIONAL_COM_AGENDAMENTOS`, HTTP 409.

### 4.17 Paciente nao acessa

```powershell
Invoke-RestMethod -Uri "$api/profissionais" -Headers $pac
```

Esperado: `SEM_PERMISSAO`, HTTP 403.

## 5. Codigos de erro novos

| Codigo | HTTP | Quando ocorre |
| --- | --- | --- |
| `PROFISSIONAL_NAO_ENCONTRADO` | 404 | id inexistente |
| `REGISTRO_JA_CADASTRADO` | 409 | conselho, UF e numero ja usados |
| `VINCULO_JA_EXISTE` | 409 | profissional ja vinculado a clinica |
| `VINCULO_NAO_ENCONTRADO` | 404 | vinculo inexistente |
| `VINCULO_INVALIDO` | 400 | clinica ou especialidade inexistente no cadastro |
| `VINCULO_COM_AGENDAMENTOS` | 409 | desativar vinculo com consultas futuras |
| `PROFISSIONAL_COM_AGENDAMENTOS` | 409 | desativar profissional com consultas futuras |

`EMAIL_JA_CADASTRADO` e `CPF_JA_CADASTRADO` ja existiam na
autenticacao e sao reaproveitados.

## 6. Decisoes do bloco

**Senha definida pelo administrador.** Decisao do grupo para a 1a
entrega. O profissional recebe a senha inicial por fora do sistema.
Convite por e-mail exigiria servico de envio e ficaria fora de escopo.

**Senha nao se altera no PATCH de cadastro.** Operacao distinta, com
risco distinto. Uma edicao de telefone nao deve poder trocar a senha
de alguem por engano.

**Especialidades usam PUT, clinicas usam POST e DELETE.** Cada vinculo
com clinica tem id proprio, referenciado por agenda e agendamentos.
Apagar e recriar geraria ids novos e orfanaria os registros
existentes. Especialidade nao tem esse problema, a tabela so liga dois
ids.

**Desativar o profissional desativa o usuario.** Sem isso, a pessoa
continuaria conseguindo fazer login mesmo sem atender.

**Troca de especialidade bloqueada por agendamentos.** Remover uma
especialidade com consultas futuras deixaria agendamentos apontando
para algo que o profissional deixou de atender.
