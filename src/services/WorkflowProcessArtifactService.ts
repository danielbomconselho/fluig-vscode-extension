import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const {
    findEclipsePluginsDirectory,
    generateEcm30Artifact,
    resolveJavaExecutable,
    writeEcm30Artifact,
} = require("./Ecm30GenerationService");

export class WorkflowProcessArtifactService {
    private static context: vscode.ExtensionContext;
    private static output: vscode.OutputChannel;
    private static timers = new Map<string, NodeJS.Timeout>();
    private static running = new Set<string>();
    private static rerun = new Set<string>();
    private static lastErrors = new Map<string, string>();

    public static initialize(context: vscode.ExtensionContext): void {
        WorkflowProcessArtifactService.context = context;
        WorkflowProcessArtifactService.output = vscode.window.createOutputChannel("Fluig ECM30");
        context.subscriptions.push(WorkflowProcessArtifactService.output);

        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
            WorkflowProcessArtifactService.scheduleAutomaticGeneration(document.uri);
        }));

        const watcher = vscode.workspace.createFileSystemWatcher("**/*.process");
        context.subscriptions.push(watcher);
        context.subscriptions.push(watcher.onDidChange(uri => {
            WorkflowProcessArtifactService.scheduleAutomaticGeneration(uri);
        }));
        context.subscriptions.push(watcher.onDidCreate(uri => {
            WorkflowProcessArtifactService.scheduleAutomaticGeneration(uri);
        }));
    }

    public static async generate(processUri?: vscode.Uri): Promise<void> {
        const selectedUri = WorkflowProcessArtifactService.resolveProcessUri(processUri);
        if (!selectedUri) {
            return;
        }

        try {
            await WorkflowProcessArtifactService.generateForUri(selectedUri, true);
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || String(error));
        }
    }

    private static scheduleAutomaticGeneration(uri: vscode.Uri): void {
        if (path.extname(uri.fsPath).toLowerCase() !== ".process") {
            return;
        }
        const enabled = vscode.workspace
            .getConfiguration("fluiggers")
            .get<boolean>("generateEcm30OnSave", true);
        if (!enabled) {
            return;
        }

        const key = path.normalize(uri.fsPath).toLowerCase();
        const previous = WorkflowProcessArtifactService.timers.get(key);
        if (previous) {
            clearTimeout(previous);
        }
        WorkflowProcessArtifactService.timers.set(key, setTimeout(() => {
            WorkflowProcessArtifactService.timers.delete(key);
            void WorkflowProcessArtifactService.runAutomaticGeneration(uri, key);
        }, 700));
    }

    private static async runAutomaticGeneration(uri: vscode.Uri, key: string): Promise<void> {
        if (WorkflowProcessArtifactService.running.has(key)) {
            WorkflowProcessArtifactService.rerun.add(key);
            return;
        }

        WorkflowProcessArtifactService.running.add(key);
        try {
            const written = await WorkflowProcessArtifactService.generateForUri(uri, false);
            WorkflowProcessArtifactService.lastErrors.delete(key);
            WorkflowProcessArtifactService.output.appendLine(
                `[${new Date().toISOString()}] ECM30 atualizado: ${written.filePath} (${written.bytes} bytes)`
            );
            vscode.window.setStatusBarMessage(
                `$(check) ECM30 atualizado: ${path.basename(uri.fsPath, ".process")}`,
                3000
            );
        } catch (error: any) {
            const message = error?.message || String(error);
            WorkflowProcessArtifactService.output.appendLine(
                `[${new Date().toISOString()}] Falha em ${uri.fsPath}: ${message}`
            );
            if (WorkflowProcessArtifactService.lastErrors.get(key) !== message) {
                WorkflowProcessArtifactService.lastErrors.set(key, message);
                vscode.window.showWarningMessage(
                    `ECM30 nao foi atualizado: ${message}`,
                    "Ver log"
                ).then(action => {
                    if (action === "Ver log") {
                        WorkflowProcessArtifactService.output.show(true);
                    }
                });
            }
        } finally {
            WorkflowProcessArtifactService.running.delete(key);
            if (WorkflowProcessArtifactService.rerun.delete(key)) {
                WorkflowProcessArtifactService.scheduleAutomaticGeneration(uri);
            }
        }
    }

    private static async generateForUri(uri: vscode.Uri, interactive: boolean): Promise<any> {
        const configuration = vscode.workspace.getConfiguration("fluiggers");
        const extensionDirectory = WorkflowProcessArtifactService.context.extensionUri.fsPath;
        const bundledPluginsPath = vscode.Uri.joinPath(
            WorkflowProcessArtifactService.context.extensionUri,
            "runtime",
            "fluig-studio",
            "plugins"
        ).fsPath;
        let pluginsDirectory = findEclipsePluginsDirectory({
            configuredPath: configuration.get<string>("eclipsePluginsPath", ""),
            bundledPath: bundledPluginsPath,
            homeDirectory: os.homedir(),
        });

        if (!pluginsDirectory && interactive) {
            const selected = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: "Selecione a pasta plugins do Eclipse com o Fluig Studio",
            });
            if (!selected?.length) {
                throw new Error("Geracao cancelada: pasta plugins do Fluig Studio nao selecionada.");
            }
            pluginsDirectory = findEclipsePluginsDirectory({
                configuredPath: selected[0].fsPath,
                bundledPath: bundledPluginsPath,
                homeDirectory: os.homedir(),
            });
            if (pluginsDirectory) {
                await configuration.update(
                    "eclipsePluginsPath",
                    pluginsDirectory,
                    vscode.ConfigurationTarget.Global
                );
            }
        }
        if (!pluginsDirectory) {
            throw new Error(
                "Plugins do Fluig Studio nao encontrados. Configure fluiggers.eclipsePluginsPath."
            );
        }

        const processId = path.basename(uri.fsPath, ".process");
        const outputPath = path.resolve(
            path.dirname(uri.fsPath),
            "..",
            ".resources",
            `${processId}.ecm30.xml`
        );
        const bridgeClassesDirectory = vscode.Uri.joinPath(
            WorkflowProcessArtifactService.context.extensionUri,
            "tools",
            "ecm30-bridge",
            "classes"
        ).fsPath;
        const operation = () => generateEcm30Artifact({
            processPath: uri.fsPath,
            pluginsDirectory,
            bridgeClassesDirectory,
            cacheDirectory: WorkflowProcessArtifactService.context.globalStorageUri.fsPath,
            javaExecutable: resolveJavaExecutable({
                configuredPath: configuration.get<string>("javaPath", ""),
            }),
            serverVersion: configuration.get<string>("fluigRuntimeVersion", "1.8.2"),
        });

        const generated: any = interactive
            ? await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Gerando ECM30 de ${processId}`,
                    cancellable: false,
                },
                operation
            )
            : await operation();

        const written = writeEcm30Artifact(outputPath, generated.content);
        if (interactive) {
            const backup = written.backupPath
                ? ` Backup anterior: ${written.backupPath}.`
                : "";
            vscode.window.showInformationMessage(
                `ECM30 de ${processId} gerado (${written.bytes} bytes).${backup}`
            );
        }
        return written;
    }

    private static resolveProcessUri(processUri?: vscode.Uri): vscode.Uri | undefined {
        const selectedUri = processUri || vscode.window.activeTextEditor?.document.uri;
        if (!selectedUri || path.extname(selectedUri.fsPath).toLowerCase() !== ".process") {
            vscode.window.showErrorMessage("Selecione um arquivo .process.");
            return;
        }
        return selectedUri;
    }
}
