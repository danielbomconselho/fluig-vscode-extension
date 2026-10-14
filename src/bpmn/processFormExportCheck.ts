'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { matchesServer } = require('./serverCatalog');

const NUMERIC_DOCUMENT_ID = /^\d+$/;

function checkProcessForm(attributes, server) {
  const cardIndex = String(attributes?.cardIndex ?? '').trim();
  if (!cardIndex) return { status: 'ok', reason: '', cardIndex };
  if (!NUMERIC_DOCUMENT_ID.test(cardIndex)) return { status: 'needs-fix', reason: 'not-published', cardIndex };
  const formSource = String(attributes?.formSource ?? '').trim().toLowerCase();
  const serverId = String(attributes?.serverId ?? '').trim();
  if (formSource === 'server' && serverId && !matchesServer(server, serverId)) {
    return { status: 'needs-fix', reason: 'other-server', cardIndex };
  }
  return { status: 'ok', reason: '', cardIndex };
}

function localFormFolder(processPath, cardIndex, exists = fs.existsSync) {
  const name = String(cardIndex ?? '').trim();
  if (!name || name !== path.basename(name) || name === '.' || name === '..') return null;
  const formsRoot = path.resolve(path.dirname(processPath), '..', '..', 'forms');
  const folder = path.join(formsRoot, name);
  return exists(folder) ? folder : null;
}

module.exports = {
  checkProcessForm,
  localFormFolder
};
