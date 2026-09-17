'use strict';

const crypto = require('node:crypto');

class BackupService {
  constructor() {
    /** @type {Map<string, Promise<unknown>>} */
    this.backups = new Map();
  }

  /**
   * Cria uma cópia do conteúdo atual do TextDocument antes da primeira edição.
   * @param {typeof import('vscode')} vscode
   * @param {import('vscode').TextDocument} document
   */
  ensureBackup(vscode, document) {
    const key = document.uri.toString();
    if (!this.backups.has(key)) {
      this.backups.set(key, this.createBackup(vscode, document));
    }
    return this.backups.get(key);
  }

  /**
   * @param {typeof import('vscode')} vscode
   * @param {import('vscode').TextDocument} document
   */
  async createBackup(vscode, document) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const root = workspaceFolder?.uri ?? vscode.Uri.joinPath(document.uri, '..');
    const configured = vscode.workspace.getConfiguration('fluiggers', document.uri)
      .get('bpmnBackupDirectory', '.fluig-bpmn/backups');
    const segments = normalizeRelativeDirectory(configured);
    const backupDirectory = vscode.Uri.joinPath(root, ...segments);
    await vscode.workspace.fs.createDirectory(backupDirectory);

    const bytes = new TextEncoder().encode(document.getText());
    const fileName = document.uri.path.split('/').pop() || 'processo.process';
    const backupName = createBackupName(fileName, bytes, new Date());
    const backupUri = vscode.Uri.joinPath(backupDirectory, backupName);
    await vscode.workspace.fs.writeFile(backupUri, bytes);
    return backupUri;
  }

  forget(documentUri) {
    this.backups.delete(documentUri.toString());
  }
}

function normalizeRelativeDirectory(value) {
  const segments = String(value || '.fluig-bpmn/backups')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.');
  if (segments.some((segment) => segment === '..')) {
    throw new Error('O diretório de backup deve permanecer dentro do workspace.');
  }
  return segments.length ? segments : ['.fluig-bpmn', 'backups'];
}

function createBackupName(fileName, bytes, date) {
  const safeName = String(fileName).replace(/[^a-z0-9_.-]/gi, '_');
  const extension = safeName.match(/\.[a-z0-9]+$/i)?.[0] || '.bak';
  const baseName = safeName.slice(0, -extension.length) || 'arquivo';
  const stamp = [
    date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), '-',
    pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds()), '-', pad(date.getMilliseconds(), 3)
  ].join('');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  return `${baseName}.${stamp}.${hash}${extension}`;
}

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

module.exports = { BackupService, createBackupName, normalizeRelativeDirectory };
