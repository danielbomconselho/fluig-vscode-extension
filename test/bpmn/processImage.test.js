'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { toWebviewData } = require('../../src/bpmn/webviewData');
const { decodeXml, descendants, tokenizeXml } = require('../../src/bpmn/xmlTokenizer');
const { renderProcessImageSvg } = require('../../src/bpmn/processImage');

function fixtureText() {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'), 'utf8');
}

function attribute(node, name) {
  return node?.attributeMap?.[name]?.value;
}

test('desenha a imagem do processo em SVG a partir da geometria do diagrama', () => {
  const text = fixtureText();
  const svg = renderProcessImageSvg(text);
  const data = toWebviewData(parseProcess(text), null);
  const elementsById = new Map(data.elements.map((element) => [element.id, element]));

  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\r?\n<svg /);
  assert.equal(renderProcessImageSvg(text), svg);

  const xml = tokenizeXml(svg);
  assert.equal(xml.children.length, 1);
  const root = xml.children[0];
  assert.equal(root.name, 'svg');
  assert.equal(attribute(root, 'xmlns'), 'http://www.w3.org/2000/svg');
  const width = Number(attribute(root, 'width'));
  const height = Number(attribute(root, 'height'));
  assert.ok(Number.isInteger(width) && width > 0);
  assert.ok(Number.isInteger(height) && height > 0);
  for (const shape of data.shapes) {
    assert.ok(shape.x + shape.visualWidth <= width, `${shape.businessObject} fora da largura`);
    assert.ok(shape.y + shape.visualHeight <= height, `${shape.businessObject} fora da altura`);
  }

  const groupsById = new Map(descendants(root, (node) => node.name === 'g' && attribute(node, 'id'))
    .map((node) => [attribute(node, 'id'), node]));
  for (const shape of data.shapes) {
    const group = groupsById.get(shape.businessObject);
    assert.ok(group, `forma ausente: ${shape.businessObject}`);
    const element = elementsById.get(shape.businessObject);
    const drawn = descendants(group, (node) => ['rect', 'ellipse', 'polygon'].includes(node.name));
    assert.ok(drawn.length >= 1, `forma sem desenho: ${shape.businessObject}`);
    if (element.code) assert.equal(attribute(group, 'sequence'), element.code);
  }
  assert.equal(descendants(groupsById.get('startevent4'), (node) => node.name === 'ellipse').length, 1);
  assert.equal(descendants(groupsById.get('exclusivegateway39'), (node) => node.name === 'polygon').length, 1);
  const endStroke = attribute(descendants(groupsById.get('endevent12'), (node) => node.name === 'ellipse')[0], 'stroke-width');
  const startStroke = attribute(descendants(groupsById.get('startevent4'), (node) => node.name === 'ellipse')[0], 'stroke-width');
  assert.ok(Number(endStroke) > Number(startStroke));

  const texts = descendants(root, (node) => node.name === 'tspan')
    .map((node) => decodeXml(svg.slice(node.openEnd, node.closeStart)));
  const joined = texts.join(' ');
  for (const task of data.elements.filter((element) => element.tag === 'BpmnTask')) {
    for (const word of task.name.split(/\s+/)) assert.ok(joined.includes(word), `texto ausente: ${task.name}`);
  }

  const flows = data.elements.filter((element) => element.tag === 'SequenceFlow');
  for (const flow of flows) {
    const group = groupsById.get(flow.id);
    assert.ok(group, `fluxo ausente: ${flow.id}`);
    assert.equal(descendants(group, (node) => node.name === 'polyline').length, 1);
    assert.equal(descendants(group, (node) => node.name === 'polygon').length, 1, `seta ausente: ${flow.id}`);
  }
  assert.ok(texts.includes('INICIO_PARA_ATIVIDADE'));
});

test('escapa nomes com caracteres especiais de XML', () => {
  const text = fixtureText().replace('name="Atividade de teste eclipse"', 'name="A &amp; B &lt;C&gt; &quot;q&quot; &apos;s&apos;"');
  const svg = renderProcessImageSvg(text);
  const root = tokenizeXml(svg).children[0];
  const texts = descendants(root, (node) => node.name === 'tspan')
    .map((node) => decodeXml(svg.slice(node.openEnd, node.closeStart)));

  assert.ok(texts.join(' ').includes('A & B <C> "q" \'s\''));
  assert.ok(svg.includes('A &amp; B &lt;C&gt;'));
});
