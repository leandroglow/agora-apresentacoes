import assert from 'node:assert/strict';
import test from 'node:test';
import { extractDriveSources } from '../api/_lib/sources.mjs';

test('extrai apenas metadados seguros das fontes do conector autorizado', () => {
  const response = {
    output: [{
      type: 'mcp_call',
      server_label: 'google_drive_catalogos',
      name: 'search',
      output: JSON.stringify({
        results: [{
          id: 'arquivo-1',
          name: 'Tabela de preços.pdf',
          web_url: 'https://drive.google.com/file/d/arquivo-1/view',
          text: 'conteúdo que não deve ser devolvido como metadado'
        }]
      })
    }, {
      type: 'mcp_call',
      server_label: 'outro_servidor',
      name: 'search',
      output: JSON.stringify({
        results: [{ id: 'segredo', name: 'Arquivo privado.pdf' }]
      })
    }]
  };

  assert.deepEqual(extractDriveSources(response), [{
    fileId: 'arquivo-1',
    filename: 'Tabela de preços.pdf',
    url: 'https://drive.google.com/file/d/arquivo-1/view'
  }]);
});

test('ignora saídas inválidas sem expor conteúdo bruto', () => {
  const response = {
    output: [{
      type: 'mcp_call',
      server_label: 'google_drive_catalogos',
      name: 'fetch',
      output: 'texto não estruturado'
    }]
  };

  assert.deepEqual(extractDriveSources(response), []);
});
