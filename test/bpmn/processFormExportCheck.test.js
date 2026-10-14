'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { checkProcessForm, localFormFolder } = require('../../src/bpmn/processFormExportCheck');

const server = { id: 'abc', name: 'Concremat dev' };

test('classifies the process form link for the target server', () => {
  const cases = [
    [{}, 'ok', ''],
    [{ cardIndex: '   ' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: '742011', serverId: 'Concremat dev' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: ' 742011 ', serverId: '' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: '742011', serverId: 'concremat dev' }, 'ok', ''],
    [{ formSource: 'local', cardIndex: '742011', serverId: 'Concremat dev' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: '742011', serverId: 'Concremat prod' }, 'needs-fix', 'other-server'],
    [{ formSource: 'local', cardIndex: 'Engineering Proposal Development', serverId: 'Concremat dev' }, 'needs-fix', 'not-published'],
    [{ formSource: 'server', cardIndex: 'abc', serverId: 'Concremat dev' }, 'needs-fix', 'not-published']
  ];
  for (const [attributes, status, reason] of cases) {
    const result = checkProcessForm(attributes, server);
    assert.equal(result.status, status, JSON.stringify(attributes));
    assert.equal(result.reason, reason, JSON.stringify(attributes));
    assert.equal(result.cardIndex, String(attributes.cardIndex ?? '').trim());
  }
});

test('locates the local form folder only inside the project forms directory', () => {
  const root = path.resolve('project');
  const processPath = path.join(root, 'workflow', 'diagrams', 'p.process');
  const existing = new Set([path.join(root, 'forms', 'Engineering Proposal Development')]);
  const exists = (candidate) => existing.has(candidate);
  assert.equal(
    localFormFolder(processPath, 'Engineering Proposal Development', exists),
    path.join(root, 'forms', 'Engineering Proposal Development')
  );
  assert.equal(localFormFolder(processPath, 'missing', exists), null);
  assert.equal(localFormFolder(processPath, '../forms/Engineering Proposal Development', exists), null);
  assert.equal(localFormFolder(processPath, '', exists), null);
});
