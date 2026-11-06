// Testes unitarios das validacoes de entrada (src/validacao.js e
// src/validacaoCnpj.js). Sao funcoes puras: nao dependem de banco nem
// de rede, por isso rodam em milissegundos no pipeline de CI.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    cpfValido,
    emailValido,
    senhaValida,
    dataNascimentoValida,
    textoValido,
    somenteDigitos
} from '../src/validacao.js';
import { cnpjValido } from '../src/validacaoCnpj.js';

describe('cpfValido', () => {
    it('aceita CPF valido com e sem pontuacao', () => {
        // CPF de exemplo usado no TESTES.md da API, valido pelo digito verificador.
        assert.equal(cpfValido('529.982.247-25'), true);
        assert.equal(cpfValido('52998224725'), true);
    });

    it('recusa digito verificador errado', () => {
        assert.equal(cpfValido('529.982.247-24'), false);
    });

    it('recusa sequencia repetida, mesmo passando no calculo', () => {
        assert.equal(cpfValido('111.111.111-11'), false);
        assert.equal(cpfValido('00000000000'), false);
    });

    it('recusa tamanho errado e valores vazios', () => {
        assert.equal(cpfValido('5299822472'), false);
        assert.equal(cpfValido(''), false);
        assert.equal(cpfValido(null), false);
        assert.equal(cpfValido(undefined), false);
    });
});

describe('cnpjValido', () => {
    it('aceita CNPJ valido com e sem pontuacao', () => {
        assert.equal(cnpjValido('11.222.333/0001-81'), true);
        assert.equal(cnpjValido('11222333000181'), true);
    });

    it('recusa digito verificador errado e sequencia repetida', () => {
        assert.equal(cnpjValido('11.222.333/0001-80'), false);
        assert.equal(cnpjValido('00.000.000/0000-00'), false);
    });

    it('recusa tamanho errado', () => {
        assert.equal(cnpjValido('1122233300018'), false);
        assert.equal(cnpjValido(undefined), false);
    });
});

describe('emailValido', () => {
    it('aceita formato comum', () => {
        assert.equal(emailValido('maria.silva@exemplo.com'), true);
        assert.equal(emailValido('  maria@exemplo.com.br  '), true);
    });

    it('recusa formatos incompletos', () => {
        assert.equal(emailValido('maria@exemplo'), false);
        assert.equal(emailValido('maria.exemplo.com'), false);
        assert.equal(emailValido('maria @exemplo.com'), false);
        assert.equal(emailValido(123), false);
    });
});

describe('senhaValida', () => {
    it('exige entre 8 e 72 caracteres', () => {
        assert.equal(senhaValida('1234567'), false);
        assert.equal(senhaValida('12345678'), true);
        assert.equal(senhaValida('a'.repeat(72)), true);
        // 72 e o limite do bcrypt: acima disso o restante seria ignorado.
        assert.equal(senhaValida('a'.repeat(73)), false);
    });

    it('recusa valores que nao sao texto', () => {
        assert.equal(senhaValida(12345678), false);
        assert.equal(senhaValida(undefined), false);
    });
});

describe('dataNascimentoValida', () => {
    it('aceita data existente no passado', () => {
        assert.equal(dataNascimentoValida('1955-03-14'), true);
    });

    it('recusa data inexistente, futura ou em outro formato', () => {
        assert.equal(dataNascimentoValida('2026-02-31'), false);
        assert.equal(dataNascimentoValida('2999-01-01'), false);
        assert.equal(dataNascimentoValida('14/03/1955'), false);
    });
});

describe('textoValido e somenteDigitos', () => {
    it('confere tamanho depois de remover espacos', () => {
        assert.equal(textoValido('  Ana  ', 3), true);
        assert.equal(textoValido('   ', 1), false);
        assert.equal(textoValido('a'.repeat(161)), false);
    });

    it('mantem apenas os digitos', () => {
        assert.equal(somenteDigitos('(81) 99999-8888'), '81999998888');
        assert.equal(somenteDigitos(null), '');
    });
});
