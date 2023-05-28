import * as vscode from "vscode";
import { readFileSync, createWriteStream } from "fs";
import { DatasetItem, ServerItem, ServerItemProvider } from "./providers/ServerItemProvider";
import axios, { AxiosRequestConfig } from "axios";
import { glob } from "glob";
import { basename } from "path";
import { DatasetService } from "./services/DatasetService";
import { FormService } from "./services/FormService";
import { GlobalEventService } from "./services/GlobalEventService";
import { UtilsService } from "./services/UtilsService";

interface ExtensionsPath {
    TEMPLATES: vscode.Uri | null,
    FORM_EVENTS: vscode.Uri | null,
    WORKFLOW_EVENTS: vscode.Uri | null,
    GLOBAL_EVENTS: vscode.Uri | null
}

interface EventsNames {
    FORM: string[],
    WORKFLOW: string[],
    GLOBAL: string[]
}

const EXTENSION_PATHS: ExtensionsPath = {
    TEMPLATES: null,
    FORM_EVENTS: null,
    WORKFLOW_EVENTS: null,
    GLOBAL_EVENTS: null
};

const EVENTS_NAMES: EventsNames = {
    FORM: [],
    WORKFLOW: [],
    GLOBAL: []
}

export function activate(context: vscode.ExtensionContext) {
    EXTENSION_PATHS.TEMPLATES = getTemplateDirectoryPath(context);
    EXTENSION_PATHS.FORM_EVENTS = vscode.Uri.joinPath(EXTENSION_PATHS.TEMPLATES, 'formEvents');
    EXTENSION_PATHS.WORKFLOW_EVENTS = vscode.Uri.joinPath(EXTENSION_PATHS.TEMPLATES, 'workflowEvents')
    EXTENSION_PATHS.GLOBAL_EVENTS = vscode.Uri.joinPath(EXTENSION_PATHS.TEMPLATES, 'globalEvents')

    EVENTS_NAMES.FORM = getTemplatesNameFromPath(EXTENSION_PATHS.FORM_EVENTS);
    EVENTS_NAMES.WORKFLOW = getTemplatesNameFromPath(EXTENSION_PATHS.WORKFLOW_EVENTS);
    EVENTS_NAMES.GLOBAL = getTemplatesNameFromPath(EXTENSION_PATHS.GLOBAL_EVENTS);

    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.installDeclarationLibrary", installDeclarationLibrary));

    // Criação de artefatos

    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newDataset", createDataset));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newForm", createForm));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newFormEvent", createFormEvent));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newWorkflowEvent", createWorkflowEvent));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newGlobalEvent", createGlobalEvent));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newMechanism", createMechanism));


    // Servidores

    const serverItemProvider = new ServerItemProvider(context);
    vscode.window.registerTreeDataProvider("fluiggers-fluig-vscode-extension.servers", serverItemProvider);

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.addServer",
        () => serverItemProvider.add()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.refreshServer",
        () => serverItemProvider.refresh()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.editServer",
        (serverItem: ServerItem) => serverItemProvider.update(serverItem)
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.deleteServer",
        (serverItem: ServerItem) => serverItemProvider.delete(serverItem)
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.datasetView",
        (datasetItem: DatasetItem) => serverItemProvider.datasetView(datasetItem)
    ));

    // Importação de artefatos

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.importDataset",
        () => DatasetService.import()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.importManyDataset",
        () => DatasetService.importMany()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.importForm",
        () => FormService.import()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.importManyForm",
        () => FormService.importMany()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.importGlobalEvent",
        () => GlobalEventService.import()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.importManyGlobalEvent",
        () => GlobalEventService.importMany()
    ));

    // Exportação de artefatos

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.exportDataset",
        function (fileUri: vscode.Uri) {
            // Ativado pela Tecla de Atalho
            if (!fileUri) {
                if (!vscode.window.activeTextEditor) {
                    vscode.window.showErrorMessage("Não há editor de texto ativo com Dataset");
                    return;
                }
                fileUri = vscode.window.activeTextEditor.document.uri;
            }

            DatasetService.export(fileUri);
        }
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.exportForm",
        function (fileUri: vscode.Uri) {
            // Ativado pela Tecla Atalho
            if (!fileUri) {
                if (!vscode.window.activeTextEditor) {
                    vscode.window.showErrorMessage("Não há editor de texto ativo com Formulário");
                    return;
                }
                fileUri = vscode.window.activeTextEditor.document.uri;
            }

            FormService.export(fileUri);
        }
    ));
}

export function deactivate() { }

/**
 * Cria um arquivo contendo um novo Dataset
 */
async function createDataset() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (EXTENSION_PATHS.TEMPLATES === null) {
        vscode.window.showInformationMessage("Erro ao carregar os templates.");
        return;
    }

    let dataset: string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Dataset (sem espaços e sem caracteres especiais)?",
        placeHolder: "ds_nome_dataset"
    }) || "";

    if (!dataset) {
        return;
    }

    if (!dataset.endsWith(".js")) {
        dataset += ".js";
    }

    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const datasetUri = vscode.Uri.joinPath(workspaceFolderUri, "datasets", dataset);

    try {
        await vscode.workspace.fs.stat(datasetUri);
        return vscode.window.showTextDocument(datasetUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        datasetUri,
        readFileSync(vscode.Uri.joinPath(EXTENSION_PATHS.TEMPLATES, 'createDataset.txt').fsPath)
    );
    vscode.window.showTextDocument(datasetUri);
}

/**
 * Cria um arquivo contendo um novo Dataset
 */
async function createMechanism() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (EXTENSION_PATHS.TEMPLATES === null) {
        vscode.window.showInformationMessage("Erro ao carregar os templates.");
        return;
    }

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

    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const mechanismUri = vscode.Uri.joinPath(workspaceFolderUri, "mechanisms", mechanism);

    try {
        await vscode.workspace.fs.stat(mechanismUri);
        return vscode.window.showTextDocument(mechanismUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        mechanismUri,
        readFileSync(vscode.Uri.joinPath(EXTENSION_PATHS.TEMPLATES, 'createMechanism.txt').fsPath)
    );
    vscode.window.showTextDocument(mechanismUri);
}

/**
 * Cria um novo formulário
 */
async function createForm() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (EXTENSION_PATHS.TEMPLATES === null) {
        vscode.window.showInformationMessage("Erro ao carregar os templates.");
        return;
    }

    let formName: string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Formulário (sem espaços e sem caracteres especiais)?",
        placeHolder: "NomeFormulario"
    }) || "";

    if (!formName) {
        return;
    }

    const formFileName = formName + ".html";
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const formUri = vscode.Uri.joinPath(
        workspaceFolderUri,
        "forms",
        formName,
        formFileName
    );

    try {
        await vscode.workspace.fs.stat(formUri);
        return vscode.window.showTextDocument(formUri);
    } catch (err) {
        console.log(vscode.workspace.workspaceFolders[0].uri);
        console.log(err);
    }

    await vscode.workspace.fs.writeFile(formUri, readFileSync(vscode.Uri.joinPath(EXTENSION_PATHS.TEMPLATES, 'form.txt').fsPath));
    vscode.window.showTextDocument(formUri);
}

/**
 * Cria um novo evento de formulário
 */
async function createFormEvent(folderUri: vscode.Uri) {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (EXTENSION_PATHS.FORM_EVENTS === null) {
        vscode.window.showInformationMessage("Erro ao carregar os templates.");
        return;
    }

    // Ativado pela Tecla de Atalho
    if (!folderUri) {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showErrorMessage("Não há editor de texto ativo com Dataset");
            return;
        }
        folderUri = vscode.window.activeTextEditor.document.uri;
    }

    if (!folderUri.path.includes("/forms/")) {
        vscode.window.showErrorMessage("Necessário selecionar um formulário para criar o evento.");
        return;
    }

    const formName: string = folderUri.path.replace(/.*\/forms\/([^/]+).*/, "$1");

    const eventName: string = await vscode.window.showQuickPick(
        EVENTS_NAMES.FORM,
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    const eventFilename = eventName + ".js";
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const eventUri = vscode.Uri.joinPath(
        workspaceFolderUri,
        "forms",
        formName,
        'events',
        eventFilename
    );

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        readFileSync(vscode.Uri.joinPath(EXTENSION_PATHS.FORM_EVENTS, `${eventName}.txt`).fsPath)
    );
    vscode.window.showTextDocument(eventUri);
}

/**
 * Cria um novo evento Global
 */
async function createGlobalEvent(folderUri: vscode.Uri) {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (EXTENSION_PATHS.GLOBAL_EVENTS === null) {
        vscode.window.showInformationMessage("Erro ao carregar os templates.");
        return;
    }

    const eventName: string = await vscode.window.showQuickPick(
        EVENTS_NAMES.GLOBAL,
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    const eventFilename = eventName + ".js";
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const eventUri = vscode.Uri.joinPath(
        workspaceFolderUri,
        "events",
        eventFilename
    );

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        readFileSync(vscode.Uri.joinPath(EXTENSION_PATHS.GLOBAL_EVENTS, `${eventName}.txt`).fsPath)
    );
    vscode.window.showTextDocument(eventUri);
}

/**
 * Cria um novo evento de Processo
 */
async function createWorkflowEvent(folderUri: vscode.Uri) {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (EXTENSION_PATHS.WORKFLOW_EVENTS === null) {
        vscode.window.showInformationMessage("Erro ao carregar os templates.");
        return;
    }

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
        EVENTS_NAMES.WORKFLOW.concat(newFunctionOption),
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    let isNewFunction = false;

    if (eventName == newFunctionOption) {
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
        ? folderUri.path.replace(/.*\/(\w+)\.process$/, "$1")
        : folderUri.path.replace(/.*\/workflow\/scripts\/([^.]+).+\.js$/, "$1");

    const eventFilename = `${processName}.${eventName}.js`;
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const eventUri = vscode.Uri.joinPath(
        workspaceFolderUri,
        "workflow",
        "scripts",
        eventFilename
    );

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        isNewFunction
            ? Buffer.from(createEmptyFunction(eventName), "utf-8")
            : readFileSync(vscode.Uri.joinPath(EXTENSION_PATHS.WORKFLOW_EVENTS, `${eventName}.txt`).fsPath)
    );
    vscode.window.showTextDocument(eventUri);
}

/**
 * Pega o diretório de templates da Extensão
 *
 * @returns O caminho do diretório de templates da Extensão
 */
function getTemplateDirectoryPath(context: vscode.ExtensionContext): vscode.Uri {
    return vscode.Uri.joinPath(context.extensionUri, 'dist', 'templates');
}

/**
 * Pega o nome dos templates de determinado diretório
 *
 * @param path Diretório onde estão os templates
 * @returns Nome dos arquivos sem a extensão
 */
function getTemplatesNameFromPath(templatesUri: vscode.Uri): string[] {
    return glob.sync(vscode.Uri.joinPath(templatesUri, '*.txt').fsPath)
        .map(filename => basename(filename, '.txt'));
}

function installDeclarationLibrary() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    const axiosConfig: AxiosRequestConfig = {
        responseType: "stream"
    };

    Promise.all([
        axios.get("https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/jsconfig.json", axiosConfig),
        axios.get("https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/fluig.d.ts", axiosConfig)
    ])
    .then(function ([jsConfig, fluigDeclarations]) {
        jsConfig.data.pipe(createWriteStream(vscode.Uri.joinPath(UtilsService.getWorkspace(), "jsconfig.json").fsPath));
        fluigDeclarations.data.pipe(createWriteStream(vscode.Uri.joinPath(UtilsService.getWorkspace(), "fluig.d.ts").fsPath));
    })
    .catch(() => vscode.window.showErrorMessage("Erro ao baixar biblioteca do GitHub. Verifique sua conexão com a Internet"));
}

/**
 * Cria o conteúdo de função compartilhada no processo
 *
 * @param functionName Nome da Função
 * @returns Definição da função
 */
function createEmptyFunction(functionName: string): string {
    return `/**
 *
 *
 */
function ${functionName}() {

}

`;
}
