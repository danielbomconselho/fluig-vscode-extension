'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchProcessForm, patchProcessServerForm } = require('../../src/bpmn/processPatcher');
const { descriptorFieldValues } = require('../../src/bpmn/processForm');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const localForms = [{ value: 't123', label: 't123', fields: ['campox', 'aprovador', 'observacao'] }];

test('links the process to a server form and keeps flags and descriptors', () => {
  const id = parseProcess(fixture).process.id;
  const local = patchProcessForm(fixture, id, {
    source: 'local',
    cardIndex: 't123',
    uniqueCardVersion: true,
    inheritFormSecurity: true,
    descriptorFields: [{ id: 'campox', label: 'Campo X' }, { id: 'aprovador', label: 'Aprovador' }]
  }, { localForms }).text;

  const result = patchProcessServerForm(local, ' 742011 ', 'Concremat dev');
  const attributes = parseProcess(result.text).process.attributes;

  assert.equal(result.changed, true);
  assert.equal(attributes.formSource, 'server');
  assert.equal(attributes.cardIndex, '742011');
  assert.equal(attributes.serverId, 'Concremat dev');
  assert.equal(attributes.uniquecardversion, 'true');
  assert.equal(attributes.inheritFormSecurity, 'true');
  assert.deepEqual(descriptorFieldValues(attributes.descriptorFields), [
    { id: 'campox', label: 'Campo X', cardIndex: '742011' },
    { id: 'aprovador', label: 'Aprovador', cardIndex: '742011' }
  ]);

  // Only the BpmnProcess open tag may change; descriptorFields can hold raw '>', so use parser offsets.
  const before = parseProcess(local).process.node;
  const after = parseProcess(result.text).process.node;
  assert.equal(result.text.slice(0, after.start), local.slice(0, before.start));
  assert.equal(result.text.slice(after.openEnd), local.slice(before.openEnd));
});

test('refuses a non numeric documentId', () => {
  assert.throws(() => patchProcessServerForm(fixture, 'abc', 'Concremat dev'), /documentId/);
});
