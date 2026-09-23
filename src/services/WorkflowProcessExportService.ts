import * as path from "path";
import * as vscode from "vscode";
import { ServerService } from "./ServerService";
import { UtilsService } from "./UtilsService";
import { WorkflowProcessArtifactService } from "./WorkflowProcessArtifactService";
import { FormService } from "./FormService";

const { FluigProcessExportService: fluigProcessExportService } = require("./FluigProcessExportService");
const {
    ecm30PathForProcess,
    isWorkflowDiagramProcessPath,
    processImagePathForProcess,
} = require("./workflowProcessPath");
const { parseProcess } = require("../bpmn/processModel");
const { patchProcessServerForm } = require("../bpmn/processPatcher");
const { checkProcessForm, localFormFolder } = require("../bpmn/processFormExportCheck");

interface ExportChoice extends vscode.QuickPickItem {
    newProcess: boolean;
}

interface ReleaseChoice extends vscode.QuickPickItem {
    release: boolean;
}

interface PreparedExport {
    service: any;
    server: any;
    options: {
        processId: string;
        processPath: string;
        ecm30Path: string;
        svgPath?: string;
        newProcess: boolean;
        release: boolean;
    };
    plan: any;
}

export class WorkflowProcessExportService {
    public static async validate(processUri?: vscode.Uri, context?: vscode.ExtensionContext): Promise<void> {
        try {
            const prepared = await WorkflowProcessExportService.prepare(processUri, context);
            if (!prepared) {
                return;
            }

            const document = await vscode.workspace.openTextDocument({
                language: "json",
                content: JSON.stringify(prepared.plan, null, 2),
            });
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || String(error));
        }
    }

    public static async export(processUri?: vscode.Uri, context?: vscode.ExtensionContext): Promise<void> {
        try {
            const prepared = await WorkflowProcessExportService.prepare(processUri, context);
            if (!prepared) {
                return;
            }

            if (
                prepared.server.confirmExporting &&
                !(await UtilsService.confirmPassword(prepared.server))
            ) {
                return;
            }

            const action = await vscode.window.showWarningMessage(
                `Exportar o processo ${prepared.options.processId} para ${prepared.server.name}?`,
                {
                    modal: true,
                    detail: WorkflowProcessExportService.formatPlan(prepared),
                },
                "Exportar"
            );
            if (action !== "Exportar") {
                return;
            }

            const result: any = await vscode.window.withProgress<any>(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Exportando processo ${prepared.options.processId}`,
                    cancellable: false,
                },
                () => prepared.service.export(
                    WorkflowProcessExportService.serverOptions(prepared.server),
                    { ...prepared.options, dryRun: false }
                )
            );

            vscode.window.showInformationMessage(
                `Processo ${result.processId} exportado. Versão retornada: ${result.version}.`
            );
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || String(error));
        }
    }

    private static async prepare(processUri?: vscode.Uri, context?: vscode.ExtensionContext): Promise<PreparedExport | undefined> {
        const selectedUri = WorkflowProcessExportService.resolveProcessUri(processUri);
        if (!selectedUri) {
            return;
        }
        if (!isWorkflowDiagramProcessPath(selectedUri.fsPath)) {
            throw new Error("O arquivo .process deve estar diretamente em workflow/diagrams.");
        }

        const server = await ServerService.getSelect();
        if (!server) {
            return;
        }

        const exportChoice = await vscode.window.showQuickPick<ExportChoice>(
            [
                {
                    label: "Nova versão",
                    description: "O processo já existe no servidor Fluig.",
                    newProcess: false,
                },
                {
                    label: "Novo processo",
                    description: "O código do processo ainda não existe no servidor.",
                    newProcess: true,
                },
            ],
            { placeHolder: "Selecione o tipo de exportação" }
        );
        if (!exportChoice) {
            return;
        }

        const releaseChoice = await vscode.window.showQuickPick<ReleaseChoice>(
            [
                {
                    label: "Exportar e liberar",
                    description: "Importa e libera a versão para uso.",
                    release: true,
                },
                {
                    label: "Exportar sem liberar",
                    description: "Importa a versão sem executar releaseProcess.",
                    release: false,
                },
            ],
            { placeHolder: "Selecione o estado final da versão" }
        );
        if (!releaseChoice) {
            return;
        }

        if (!(await WorkflowProcessExportService.ensureProcessForm(selectedUri, server, context))) {
            return;
        }

        const processId = path.basename(selectedUri.fsPath, ".process");
        const diagramsFolder = path.dirname(selectedUri.fsPath);
        await WorkflowProcessArtifactService.ensureGenerated(selectedUri);
        const ecm30Path = ecm30PathForProcess(selectedUri.fsPath);
        const svgPath = processImagePathForProcess(selectedUri.fsPath);
        await vscode.workspace.fs.stat(vscode.Uri.file(ecm30Path));

        const options = {
            processId,
            processPath: selectedUri.fsPath,
            ecm30Path,
            svgPath,
            newProcess: exportChoice.newProcess,
            release: releaseChoice.release,
        };
        const service = new fluigProcessExportService();
        const plan = await service.export(
            WorkflowProcessExportService.serverOptions(server),
            { ...options, dryRun: true }
        );

        return { service, server, options, plan };
    }

    private static async ensureProcessForm(
        processUri: vscode.Uri,
        server: any,
        context?: vscode.ExtensionContext
    ): Promise<boolean> {
        const openDocument = vscode.workspace.textDocuments.find(
            document => document.uri.toString() === processUri.toString()
        );
        if (openDocument?.isDirty) {
            throw new Error("Salve o arquivo .process antes de exportar.");
        }

        const text = Buffer.from(await vscode.workspace.fs.readFile(processUri)).toString("utf8");
        const attributes = parseProcess(text).process?.attributes ?? {};
        const check = checkProcessForm(attributes, server);
        if (check.status === "ok") {
            return true;
        }

        const formFolder = check.reason === "not-published"
            ? localFormFolder(processUri.fsPath, check.cardIndex)
            : null;
        const pickAction = "Escolher formulário do servidor";
        const publishAction = "Publicar formulário local";
        const actions = formFolder && context ? [pickAction, publishAction] : [pickAction];
        const detail = check.reason === "other-server"
            ? `O formulário ${check.cardIndex} está vinculado ao servidor ${attributes.serverId}, não a ${server.name}.`
            : `O formulário "${check.cardIndex}" ainda não foi publicado: o Fluig exige o documentId do formulário.`
                + (formFolder ? "" : ` A pasta forms/${check.cardIndex} não existe no projeto.`);
        const action = await vscode.window.showWarningMessage(
            "Formulário do processo inválido para exportação.",
            { modal: true, detail },
            ...actions
        );
        if (!action) {
            return false;
        }

        const documentId = action === publishAction
            ? await FormService.publishForm(context!, server, formFolder!)
            : await WorkflowProcessExportService.pickServerForm(server, check.cardIndex);
        if (documentId === undefined) {
            return false;
        }

        const patched = patchProcessServerForm(text, String(documentId), server.name);
        await vscode.workspace.fs.writeFile(processUri, Buffer.from(patched.text, "utf8"));
        vscode.window.showInformationMessage(
            `Processo vinculado ao formulário ${documentId} de ${server.name}.`
        );
        return true;
    }

    private static async pickServerForm(server: any, preferredName: string): Promise<number | undefined> {
        let forms: any[] = [];
        try {
            forms = await FormService.getForms(server);
        } catch (error: any) {
            vscode.window.showWarningMessage(
                `Não foi possível listar os formulários de ${server.name}: ${error?.message || error}`
            );
        }

        if (forms.length) {
            const items = forms
                .map(form => ({
                    label: `${form.documentId} - ${form.documentDescription}`,
                    detail: form.datasetName,
                    documentId: Number(form.documentId),
                    preferred: form.documentDescription === preferredName,
                }))
                .sort((a, b) => Number(b.preferred) - Number(a.preferred));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: "Selecione o formulário do servidor",
                matchOnDetail: true,
            });
            return picked?.documentId;
        }

        const typed = await vscode.window.showInputBox({
            prompt: `Informe o documentId do formulário em ${server.name}`,
            validateInput: value => /^\d+$/.test(value.trim()) ? undefined : "Informe apenas números.",
        });
        return typed === undefined ? undefined : Number(typed.trim());
    }

    private static resolveProcessUri(processUri?: vscode.Uri): vscode.Uri | undefined {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const tabInput = activeTab?.input;
        const tabUri = tabInput instanceof vscode.TabInputText || tabInput instanceof vscode.TabInputCustom
            ? tabInput.uri
            : undefined;
        const selectedUri = processUri || vscode.window.activeTextEditor?.document.uri || tabUri;
        if (!selectedUri || path.extname(selectedUri.fsPath).toLowerCase() !== ".process") {
            vscode.window.showErrorMessage("Selecione um arquivo .process.");
            return;
        }
        return selectedUri;
    }

    private static serverOptions(server: any) {
        return {
            baseUrl: UtilsService.getHost(server),
            companyId: server.companyId,
            username: server.username,
            password: server.password,
            userCode: server.userCode,
        };
    }

    private static formatPlan(prepared: PreparedExport): string {
        const mode = prepared.options.newProcess ? "novo processo" : "nova versão";
        const release = prepared.options.release ? "sim" : "não";
        const operations = prepared.plan.steps
            .map((step: any) => `${step.order}. ${step.name}`)
            .join("\n");
        const files = prepared.plan.artifacts
            .map((artifact: any) => `${artifact.fileName} (${artifact.normalizedSize} bytes)`)
            .join("\n");

        return [
            `Destino: ${UtilsService.getHost(prepared.server)}`,
            `Empresa: ${prepared.server.companyId}`,
            `Modo: ${mode}`,
            `Liberar: ${release}`,
            "",
            "Arquivos:",
            files,
            "",
            "Operações:",
            operations,
        ].join("\n");
    }
}
