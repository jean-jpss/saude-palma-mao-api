// Testes unitarios dos utilitarios compartilhados pelos controllers
// (src/utilitarios.js) e do formato de erro da API (src/erros.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    idValido,
    inteiroOpcional,
    dataValida,
    horaNormalizada,
    minutosDesdeMeiaNoite,
    listaDeIds,
    frasePlural,
    normalizarParaBusca
} from '../src/utilitarios.js';
import { ErroApi } from '../src/erros.js';

describe('idValido', () => {
    it('devolve o numero quando e inteiro positivo', () => {
        assert.equal(idValido('7'), 7);
        assert.equal(idValido(3), 3);
    });

    it('devolve null para zero, negativo, decimal ou texto', () => {
        assert.equal(idValido('0'), null);
        assert.equal(idValido(-1), null);
        assert.equal(idValido('2.5'), null);
        assert.equal(idValido('abc'), null);
    });
});

describe('inteiroOpcional', () => {
    it('trata ausencia como null', () => {
        assert.equal(inteiroOpcional(undefined, 'idClinica'), null);
        assert.equal(inteiroOpcional('', 'idClinica'), null);
    });

    it('lanca DADOS_INVALIDOS (HTTP 400) para valor invalido', () => {
        assert.throws(
            () => inteiroOpcional('abc', 'idClinica'),
            (erro) => erro instanceof ErroApi && erro.status === 400 && erro.codigo === 'DADOS_INVALIDOS'
        );
    });
});

describe('datas e horas', () => {
    it('dataValida confere o formato AAAA-MM-DD', () => {
        assert.equal(dataValida('2026-11-13'), true);
        assert.equal(dataValida('13/11/2026'), false);
    });

    it('horaNormalizada aceita HH:MM e HH:MM:SS e recusa hora invalida', () => {
        assert.equal(horaNormalizada('08:00'), '08:00');
        assert.equal(horaNormalizada('08:00:00'), '08:00');
        assert.equal(horaNormalizada('24:00'), null);
        assert.equal(horaNormalizada('8h'), null);
        assert.equal(horaNormalizada(800), null);
    });

    it('minutosDesdeMeiaNoite converte a hora em minutos', () => {
        assert.equal(minutosDesdeMeiaNoite('08:30'), 510);
        assert.equal(minutosDesdeMeiaNoite('00:00'), 0);
    });
});

describe('listaDeIds', () => {
    it('converte lista valida em numeros', () => {
        assert.deepEqual(listaDeIds(['1', 2], 'especialidades'), [1, 2]);
        assert.equal(listaDeIds(undefined, 'especialidades'), undefined);
    });

    it('recusa valor que nao e lista ou que tem item invalido', () => {
        assert.throws(() => listaDeIds('1,2', 'especialidades'), ErroApi);
        assert.throws(() => listaDeIds([1, 0], 'especialidades'), ErroApi);
    });
});

describe('textos', () => {
    it('frasePlural faz a concordancia', () => {
        assert.equal(frasePlural(1), 'Existe 1 consulta marcada');
        assert.equal(frasePlural(3), 'Existem 3 consultas marcadas');
    });

    it('normalizarParaBusca remove acento e neutraliza curingas do LIKE', () => {
        assert.equal(normalizarParaBusca('  Clínica  '), 'clinica');
        assert.equal(normalizarParaBusca('100%_'), '100\\%\\_');
    });
});
