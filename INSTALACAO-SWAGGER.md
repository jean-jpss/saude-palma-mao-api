# Documentação da API com Swagger

Implementação da P7 do relatório de pendências: o contrato OpenAPI.

Resultado: uma página interativa em `/docs`, onde é possível ver cada rota, preencher os campos e executar a requisição direto do navegador, sem PowerShell nem Postman.

## 1. Instalar as dependências

```powershell
npm install swagger-ui-express swagger-jsdoc
```

## 2. Copiar os arquivos

| Arquivo | Destino | Ação |
| --- | --- | --- |
| `swagger.js` | `src/` | novo |
| `servidor.js` | `src/` | **substitui** |
| os 8 arquivos de `routes/` | `src/routes/` | **substituem** |

Os arquivos de rotas ganharam as anotações JSDoc. A lógica deles não mudou: continuam apenas ligando o caminho ao controller.

Nada muda em `models`, `controllers`, `middlewares`, no banco ou no `.env`.

## 3. Rodar

```powershell
npm run dev
```

Abra `http://localhost:3000/docs`.

## 4. Como usar a interface

Para testar uma rota protegida, é preciso autenticar primeiro:

1. Abra `POST /autenticacao/login`, clique em **Try it out**
2. No corpo, use um dos usuários de teste:
   ```json
   { "identificador": "52998224725", "senha": "senhaSegura123" }
   ```
3. Execute e copie o valor do campo `token` da resposta
4. Clique em **Authorize**, no topo da página
5. Cole **apenas o token**, sem a palavra `Bearer`
6. Confirme

A partir daí, todas as rotas podem ser executadas pela própria página. O token fica guardado mesmo se você recarregar.

## 5. Endereços novos

| Endereço | O que é |
| --- | --- |
| `/docs` | documentação interativa |
| `/openapi.json` | especificação bruta, em JSON |
| `/` | agora responde com os links acima, em vez de 404 |

O `/openapi.json` é útil além da leitura: pode ser importado no Postman e no Insomnia, e serve para gerar cliente de API automaticamente.

## 6. Como a documentação é montada

Duas fontes se combinam:

**`src/swagger.js`** traz as informações gerais da API, o esquema de autenticação e os schemas reutilizáveis, como `Agendamento`, `Clinica` e `Profissional`. Definir cada estrutura uma vez e referenciá-la com `$ref` evita repetição e garante que a documentação não divirja entre rotas.

**As anotações JSDoc em `src/routes/*.js`** descrevem cada operação: parâmetros, corpo da requisição, respostas possíveis e códigos de erro.

A escolha de manter as anotações ao lado das rotas é deliberada. Quem altera uma rota vê a anotação logo acima dela, o que reduz a chance de a documentação envelhecer sem ninguém perceber.

## 7. O que foi documentado

23 caminhos e 33 operações, cobrindo toda a API.

As descrições não se limitam a listar campos. Elas registram as decisões de projeto que o front precisa conhecer, por exemplo:

- Por que `idProfissionalClinica` não é o mesmo que `idProfissional`, e por que a agenda pertence ao vínculo
- Por que consultar os horários de hoje sempre devolve lista vazia
- Por que `08:17` é recusado mesmo estando dentro da janela das 08:00 às 12:00
- Por que acesso indevido devolve 404 em vez de 403
- Por que a senha não pode ser alterada na rota de edição de cadastro
- A ordem exata em que as seis validações de agendamento são aplicadas

## 8. Um defeito encontrado durante a implementação

Ao validar a especificação, uma das rotas de clínica não aparecia. A causa era uma descrição de uma linha contendo dois pontos, o que o analisador de YAML interpretou como início de um novo campo.

A correção foi passar a descrição para bloco de várias linhas. Vale saber para quem for acrescentar rotas depois: descrições com dois pontos precisam usar o formato de bloco, que começa com uma barra vertical.

## 9. Verificação

Antes do commit, confirme que a especificação é gerada sem erro:

```powershell
npm run dev
```

No terminal do servidor, não deve aparecer nenhuma mensagem começando com "Error in src/routes". Se aparecer, há YAML malformado em alguma anotação, e a rota correspondente some da documentação sem quebrar a API.

E confira a contagem na página: devem aparecer sete grupos de rotas, de Autenticação a Agenda.

## 10. Sobre o acesso público

A documentação fica aberta, sem exigir token. Isso é adequado para um projeto acadêmico: facilita a avaliação e a demonstração.

Em um sistema real com dados de saúde, o normal seria restringir `/docs` ao ambiente de desenvolvimento, ou protegê-lo por autenticação. Vale mencionar isso na apresentação, porque demonstra consciência da diferença entre o contexto acadêmico e o produtivo.

Se quiser implementar, bastaria envolver o `app.use('/docs', ...)` em uma condição que verifique `process.env.AMBIENTE`.

## 11. O que dizer na apresentação

O Swagger não é só documentação. Ele é o **contrato** entre back e front: define o que cada rota aceita e devolve, de forma executável e verificável.

Dois ganhos concretos no projeto:

A equipe de front pode explorar e testar a API antes de escrever qualquer linha de código, sem depender de alguém explicar cada rota.

E o arquivo `/openapi.json` permite gerar um servidor falso, o que tornaria possível desenvolver a interface mesmo antes do backend existir. No caso deste projeto o backend ficou pronto primeiro, mas é a prática recomendada quando as duas frentes correm em paralelo.
