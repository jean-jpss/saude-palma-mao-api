# P5: consulta de clinicas

Requisito 7 da 1a entrega: "permitir que o paciente visualize e
pesquise clinicas cadastradas na plataforma".

## 1. Copiar o arquivo

`clinicas.js` vai para `src/rotas/`.

## 2. Registrar no servidor.js

Import, no topo:

```javascript
import rotasClinicas from './rotas/clinicas.js';
```

Rota, junto das outras:

```javascript
app.use('/clinicas', rotasClinicas);
```

Conferir:

```powershell
Select-String -Path src\servidor.js -Pattern "rotasClinicas"
```

Esperado: duas linhas.

## 3. Testes

```powershell
$api = "http://localhost:3000"

$login = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $login -ContentType "application/json"
$cab = @{ Authorization = "Bearer $($r.token)" }
```

### 3.1 Listar todas

```powershell
Invoke-RestMethod -Uri "$api/clinicas" -Headers $cab | ConvertTo-Json -Depth 4
```

Esperado: 3 clinicas em ordem alfabetica, cada uma com endereco e a
lista de especialidades que atende.

### 3.2 Filtrar por especialidade

```powershell
Invoke-RestMethod -Uri "$api/clinicas?idEspecialidade=3" -Headers $cab |
  Select-Object idClinica, nome
```

Ortopedia e atendida pelo Hospital Portugues e pelo Hospital Unimed,
conforme o seed. Esperado: 2 clinicas.

```powershell
Invoke-RestMethod -Uri "$api/clinicas?idEspecialidade=5" -Headers $cab |
  Select-Object idClinica, nome
```

Oftalmologia so no Hospital Esperanca. Esperado: 1 clinica.

### 3.3 Busca por texto

```powershell
Invoke-RestMethod -Uri "$api/clinicas?busca=unimed" -Headers $cab |
  Select-Object idClinica, nome
```

A busca ignora maiusculas e minusculas e procura no nome e no bairro.

```powershell
Invoke-RestMethod -Uri "$api/clinicas?busca=derby" -Headers $cab |
  Select-Object idClinica, nome
```

Derby e o bairro do Hospital Unimed. Esperado: 1 clinica.

### 3.4 Combinar os dois filtros

```powershell
Invoke-RestMethod -Uri "$api/clinicas?idEspecialidade=3&busca=portugues" -Headers $cab |
  Select-Object idClinica, nome
```

Esperado: 1 clinica.

### 3.5 Busca sem resultado

```powershell
(Invoke-RestMethod -Uri "$api/clinicas?busca=naoexiste" -Headers $cab).Count
```

Esperado: 0. Lista vazia nao e erro, e um estado que o front precisa
tratar com mensagem amigavel.

### 3.6 Detalhe

```powershell
Invoke-RestMethod -Uri "$api/clinicas/1" -Headers $cab | ConvertTo-Json -Depth 4
```

### 3.7 Clinica inexistente

```powershell
Invoke-RestMethod -Uri "$api/clinicas/999" -Headers $cab
```

Esperado: CLINICA_NAO_ENCONTRADA, HTTP 404.

### 3.8 Sem token

```powershell
Invoke-RestMethod -Uri "$api/clinicas"
```

Esperado: NAO_AUTENTICADO, HTTP 401.

## 4. Observacao para o front

O objeto endereco traz os campos separados e tambem o campo
`completo`, com a linha pronta para exibir. Use o `completo` em listas
e os campos separados quando precisar formatar de outro jeito.

O CNPJ nao e devolvido de proposito. E dado cadastral da empresa, sem
utilidade para o paciente escolher onde se consultar.

## 5. Codigo de erro novo

`CLINICA_NAO_ENCONTRADA`, HTTP 404. Precisa entrar na secao 5 do
documento de regras e no guia da API do front-end.
