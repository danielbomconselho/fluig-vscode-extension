import * as vscode from 'vscode';
import { UtilsService } from "../services/UtilsService";
import { readFileSync } from "fs";
import { TemplateService } from "../services/TemplateService";
import { AttributionMechanismService } from '../services/AttributionMechanismService';
import { WorkflowService } from '../services/WorkflowService';

export class WorkflowExtension {

    public static activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newWorkflowEvent",
            WorkflowExtension.createWorkflowEvent
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newMechanism",
            WorkflowExtension.createMechanism
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importManyMechanisms",
            AttributionMechanismService.importMany
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importMechanism",
            AttributionMechanismService.import
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.exportMechanism",
            WorkflowExtension.exportMechanism
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.updateEvent",
            WorkflowExtension.updateWorkflowEvent
        ));
    }

    /**
     * Atualiza um Evento de Processo
     */
    private static async updateWorkflowEvent(fileUri: vscode.Uri) {
        // Ativado pela Tecla de Atalho
        if (!fileUri) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("Não há editor de texto ativo com script de evento");
                return;
            }
            fileUri = vscode.window.activeTextEditor.document.uri;
        }
        WorkflowService.update(fileUri);
    }

    /**
     * Cria um Evento de Processo
     */
    private static async createWorkflowEvent(folderUri: vscode.Uri) {
        // Ativado pelo Atalho
        if (!folderUri) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("Não há editor de texto ativo com Dataset");
                return;
            }
            folderUri = vscode.window.activeTextEditor.document.uri;
        }

        if (!folderUri.path.endsWith(".process") && !folderUri.path.endsWith(".js")) {
            vscode.window.showErrorMessage("Necessário selecionar um Processo para criar o evento.");
            return;
        }

        const newFunctionOption = 'Nova Função';

        let eventName: string = await vscode.window.showQuickPick(
            TemplateService.workflowEventsNames.concat(newFunctionOption),
            {
                canPickMany: false,
                placeHolder: "Selecione o Evento"
            }
        ) || "";

        if (!eventName) {
            return;
        }

        let isNewFunction = false;

        if (eventName === newFunctionOption) {
            eventName = await vscode.window.showInputBox({
                prompt: "Qual o nome da Nova Função (sem espaços e sem caracteres especiais)?",
                placeHolder: "nomeFuncao"
            }) || "";

            if (!eventName) {
                return;
            }

            isNewFunction = true;
        }

        const processName: string =
            folderUri.path.endsWith(".process")
                ? folderUri.path.replace(/.*\/workflow\/diagrams\/([^.]+)\.process$/, "$1")
                : folderUri.path.replace(/.*\/workflow\/scripts\/([^.]+).+\.js$/, "$1");

        const eventFilename = `${processName}.${eventName}.js`;
        const eventUri = vscode.Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "workflow",
            "scripts",
            eventFilename
        );

        try {
            // Se Evento já existe carrega o arquivo no editor
            await vscode.workspace.fs.stat(eventUri);
            return vscode.window.showTextDocument(eventUri);
        } catch (err) {

        }

        await vscode.workspace.fs.writeFile(
            eventUri,
            isNewFunction
                ? Buffer.from(TemplateService.createEmptyFunction(eventName), "utf-8")
                : readFileSync(vscode.Uri.joinPath(TemplateService.workflowEventsUri, `${eventName}.txt`).fsPath)
        );
        vscode.window.showTextDocument(eventUri);
    }

    /**
     * Cria um arquivo contendo um novo Mecanismo customizado
     */
    private static async createMechanism() {
        let mechanism: string = await vscode.window.showInputBox({
            prompt: "Qual o nome do Mecanismo Customizado (sem espaços e sem caracteres especiais)?",
            placeHolder: "mecanismo_customizado"
        }) || "";

        if (!mechanism) {
            return;
        }

        if (!mechanism.endsWith(".js")) {
            mechanism += ".js";
        }

        const mechanismUri = vscode.Uri.joinPath(UtilsService.getWorkspaceUri(), "mechanisms", mechanism);

        try {
            // Se Mecanismo já existe carrega o arquivo no editor
            await vscode.workspace.fs.stat(mechanismUri);
            return vscode.window.showTextDocument(mechanismUri);
        } catch (err) {

        }

        await vscode.workspace.fs.writeFile(
            mechanismUri,
            readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'createMechanism.txt').fsPath)
        );
        vscode.window.showTextDocument(mechanismUri);
    }

    private static exportMechanism(fileUri: vscode.Uri) {
        // Ativado pela Tecla de Atalho
        if (!fileUri) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("Não há editor de texto ativo com Mecanismo Customizado");
                return;
            }
            fileUri = vscode.window.activeTextEditor.document.uri;
        }

        AttributionMechanismService.export(fileUri);
    }
}
