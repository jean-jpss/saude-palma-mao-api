# P4a: cadastros administrativos de especialidades e clinicas

Requisitos 1 e 3 da 1a entrega. O requisito 2, cadastro de
profissionais, vem no bloco seguinte por ser mais complexo.

## 1. Arquivos

| Arquivo | Destino | Acao |
| --- | --- | --- |
| `validacaoCnpj.js` | `src/` | novo |
| `especialidades.js` | `src/rotas/` | **substitui** |
| `clinicas.js` | `src/rotas/` | **substitui** |

Atencao: `validacaoCnpj.js` vai em `src/`, ao lado de `validacao.js`,
e nao em `src/rotas/`.

Nenhuma alteracao no `servidor.js`: as duas rotas ja estao registradas.

## 2. Rotas novas

| Metodo e rota | Perfil |
| --- | --- |
| `POST /especialidades` | administrador |
| `PATCH /especialidades/:id` | administrador |
| `DELETE /especialidades/:id` | administrador |
| `POST /clinicas` | administrador |
| `PATCH /clinicas/:id` | administrador |
| `PUT /clinicas/:id/especialidades` | administrador |
| `DELETE /clinicas/:id` | administrador |

As rotas GET que ja existiam continuam funcionando igual, com um
acrescimo: o administrador pode passar `?incluirInativas=true` para
ver tambem os registros desativados.

## 3. Preparar o terminal

```powershell
$api = "http://localhost:3000"

$loginAdm = @{ identificador = "admin@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$ra = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginAdm -ContentType "application/json"
$adm = @{ Authorization = "Bearer $($ra.token)" }

$loginPac = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json
$rp = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginPac -ContentType "application/json"
$pac = @{ Authorization = "Bearer $($rp.token)" }
```

## 4. Testes de especialidade

### 4.1 Cadastrar

```powershell
$nova = @{ nome = "Pneumologia"; descricao = "Cuida dos pulmoes e da respiracao." } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/especialidades" -Method Post -Body $nova -ContentType "application/json" -Headers $adm | ConvertTo-Json
```

Esperado: HTTP 201, com `idEspecialidade` 9 e `ativo: true`.

### 4.2 Nome duplicado

Repita o comando acima.
Esperado: `ESPECIALIDADE_JA_EXISTE`, HTTP 409.

### 4.3 Alterar a descricao

```powershell
$id = 9
$alterar = @{ descricao = "Cuida dos pulmoes, da respiracao e da asma." } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/especialidades/$id" -Method Patch -Body $alterar -ContentType "application/json" -Headers $adm | ConvertTo-Json
```

O nome nao foi enviado e permanece inalterado. E isso que torna a
atualizacao parcial.

### 4.4 Paciente nao cadastra

```powershell
Invoke-RestMethod -Uri "$api/especialidades" -Method Post -Body $nova -ContentType "application/json" -Headers $pac
```

Esperado: `SEM_PERMISSAO`, HTTP 403.

### 4.5 Desativar

```powershell
Invoke-RestMethod -Uri "$api/especialidades/$id" -Method Delete -Headers $adm
(Invoke-RestMethod -Uri "$api/especialidades" -Headers $pac).Count
```

Esperado: HTTP 204 e contagem de volta a 8. A especialidade some da
lista do paciente.

### 4.6 O administrador ainda a enxerga

```powershell
(Invoke-RestMethod -Uri "$api/especialidades?incluirInativas=true" -Headers $adm).Count
```

Esperado: 9. Desativacao logica preserva o registro.

### 4.7 Desativar especialidade com consultas marcadas

```powershell
Invoke-RestMethod -Uri "$api/especialidades/3" -Method Delete -Headers $adm
```

Ortopedia tem consultas futuras marcadas nos testes anteriores.
Esperado: `ESPECIALIDADE_COM_AGENDAMENTOS`, HTTP 409.

Se vier HTTP 204, e porque nao ha consulta futura ativa em Ortopedia.
Nesse caso, reative antes de seguir:

```powershell
$reativar = @{ ativo = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/especialidades/3" -Method Patch -Body $reativar -ContentType "application/json" -Headers $adm | ConvertTo-Json
```

## 5. Testes de clinica

### 5.1 Cadastrar

```powershell
$clinica = @{
  nome = "Clinica Boa Viagem"
  cnpj = "11222333000181"
  telefone = "8130000004"
  email = "contato@exemplo-boaviagem.test"
  logradouro = "Avenida Boa Viagem"
  numero = "1500"
  bairro = "Boa Viagem"
  cidade = "Recife"
  uf = "PE"
  cep = "51020000"
  horarioFuncionamento = "Segunda a sexta, 8h as 18h"
  idsEspecialidades = @(1, 2, 8)
} | ConvertTo-Json

Invoke-RestMethod -Uri "$api/clinicas" -Method Post -Body $clinica -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 4
```

Esperado: HTTP 201, com as tres especialidades ja vinculadas.

O CNPJ 11222333000181 e valido pelo digito verificador e nao pertence
a nenhuma empresa real.

### 5.2 CNPJ invalido

```powershell
$ruim = @{ nome = "Clinica Teste"; cnpj = "11111111111111"; logradouro = "Rua Teste" } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/clinicas" -Method Post -Body $ruim -ContentType "application/json" -Headers $adm
```

Catorze digitos repetidos passam no formato e falham no calculo.
Esperado: `DADOS_INVALIDOS`, HTTP 400.

### 5.3 CNPJ duplicado

Repita o comando do item 5.1.
Esperado: `CNPJ_JA_CADASTRADO`, HTTP 409.

### 5.4 Alterar o telefone

```powershell
$id = 4
$mudar = @{ telefone = "8131111111" } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/clinicas/$id" -Method Patch -Body $mudar -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 3
```

O resto dos dados permanece.

### 5.5 Substituir as especialidades

```powershell
$lista = @{ idsEspecialidades = @(1, 3, 5) } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/clinicas/$id/especialidades" -Method Put -Body $lista -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 3
```

Esperado: Clinica Geral, Oftalmologia e Ortopedia. As anteriores
sairam, porque PUT substitui a lista inteira.

### 5.6 Especialidade inexistente

```powershell
$invalida = @{ idsEspecialidades = @(999) } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/clinicas/$id/especialidades" -Method Put -Body $invalida -ContentType "application/json" -Headers $adm
```

Esperado: `ESPECIALIDADE_NAO_ENCONTRADA`, HTTP 400.

### 5.7 Desativar clinica sem agendamentos

```powershell
Invoke-RestMethod -Uri "$api/clinicas/$id" -Method Delete -Headers $adm
(Invoke-RestMethod -Uri "$api/clinicas" -Headers $pac).Count
```

Esperado: HTTP 204 e contagem de volta a 3.

### 5.8 Desativar clinica com agendamentos

```powershell
Invoke-RestMethod -Uri "$api/clinicas/1" -Method Delete -Headers $adm
```

O Hospital Portugues tem consultas futuras marcadas nos testes
anteriores.
Esperado: `CLINICA_COM_AGENDAMENTOS`, HTTP 409.

### 5.9 Reativar

```powershell
$reativar = @{ ativo = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/clinicas/$id" -Method Patch -Body $reativar -ContentType "application/json" -Headers $adm | ConvertTo-Json -Depth 2
```

Reativar e so um PATCH com ativo true. Nao existe rota separada.

## 6. Codigos de erro novos

| Codigo | HTTP | Quando ocorre |
| --- | --- | --- |
| `ESPECIALIDADE_JA_EXISTE` | 409 | nome de especialidade duplicado |
| `ESPECIALIDADE_NAO_ENCONTRADA` | 404 e 400 | id inexistente, ou id invalido na lista de vinculos |
| `ESPECIALIDADE_COM_AGENDAMENTOS` | 409 | desativar especialidade com consultas futuras |
| `CNPJ_JA_CADASTRADO` | 409 | CNPJ duplicado |
| `CLINICA_COM_AGENDAMENTOS` | 409 | desativar clinica com consultas futuras |

`CLINICA_NAO_ENCONTRADA` ja havia sido criado na P5.

## 7. Decisoes do bloco

**Desativacao logica, nunca remocao.** O schema foi desenhado assim.
Agendamentos passados referenciam clinica e especialidade, e apagar a
linha quebraria o historico.

**Bloqueio por agendamentos futuros.** Mesma logica da regra 1.3
aplicada a disponibilidade: nao se desativa algo que tem consulta
marcada. Protege o paciente de perder o agendamento sem aviso.

**PUT para a lista de especialidades.** O corpo representa o estado
final desejado, nao um acrescimo. O que nao estiver na lista sai.

**CNPJ com digito verificador.** Mesma abordagem do CPF. Catorze
numeros nao bastam.
