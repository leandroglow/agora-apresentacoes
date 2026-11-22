import {test} from 'node:test';
import assert from 'node:assert/strict';
import {directoryUrl} from '../dashboard/link-directory.js';
import {sanitizeDashboardData} from '../api/_lib/routes/dashboard.mjs';

test('allowed publication URLs are available only in the Links directory', () => {
  const url = 'https://leandroglow.github.io/example/';
  const other = {title:'Projeto', url, privateNote:'não exibir'};
  const {modules,projects} = sanitizeDashboardData({
    modules:[{id:'links', items:[other, {...other, url:'https://example.org/'}]}],
    projects:[other]
  });
  assert.equal(modules[0].items.length,1);
  assert.equal(modules[0].items[0].url,url);
  assert.equal(modules[0].items[0].privateNote,undefined);
  assert.equal(projects[0].url,undefined);
});
test('directory rejects unapproved destinations and keeps deep links', () => {
  const published = 'https://apresentacoes.agoracons.com.br/sistema/?area=organizacao';
  assert.equal(directoryUrl(published),published);
  for (const value of [null,'','/sistema/','https://apresentacoes.agoracons.com.br.example.org/',
    'http://leandroglow.github.io/','https://user@ha.agoracons.com.br/','https://leandroglow.github.io:9443/']) {
    assert.equal(directoryUrl(value),null);
  }
});
