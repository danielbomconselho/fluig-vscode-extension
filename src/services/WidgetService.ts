import { Uri, window, workspace, FileType, QuickPickItem } from 'vscode';
import { readFileSync } from "fs";
import { glob } from "glob";
import { basename } from "path";
import * as JSZip from 'jszip';
import { UtilsService } from "../services/UtilsService";
import { TemplateService } from "../services/TemplateService";
import { ServerService } from "./ServerService";
import {LoginService} from "./LoginService";
import { ServerDTO } from '../models/ServerDTO';
import * as fs from 'fs'; // Import the 'fs' module
import path = require('path');

const basePathUWE = "/UWE/rest/conn/";
const warFolderPath = Uri.joinPath(UtilsService.getWorkspaceUri(),"wcm","widget").toString();

export class WidgetService {
    /**
     * Create Widget
     */
    public static async create() {
        const widgetName: string = await window.showInputBox({
            prompt: "Qual o nome do Widget (sem espaços e sem caracteres especiais)?",
            placeHolder: "NomeWidget"
        }) || "";

        if (!widgetName) {
            return;
        }

        const widgetFileName = "view.ftl";

        const widgetUriFile = Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName,
            "src",
            "main",
            "resources",
            widgetFileName
        );

        try {
            // Se widget já existe carrega o arquivo no editor
            await workspace.fs.stat(widgetUriFile);
            return window.showTextDocument(widgetUriFile);
        } catch (err) {

        }

        const propertiesLanguages = ["en_US", "es", "pt_BR"];

        const widgetUri = Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName
        );

        // Copia todo o template da Widget
        await workspace.fs.copy(Uri.joinPath(TemplateService.templatesUri, 'widget'), widgetUri);

        const baseResourcesUri = Uri.joinPath(widgetUri, "src", "main", "resources");
        const baseWebAppUri = Uri.joinPath(widgetUri, "src", "main", "webapp");
        const basePropertiesUri = Uri.joinPath(baseResourcesUri, "widgetname.properties");

        const promises = propertiesLanguages.map(lang => workspace.fs.copy(
            basePropertiesUri,
            Uri.joinPath(baseResourcesUri, `${widgetName}_${lang}.properties`)
        ));

        promises.push(
            workspace.fs.rename(
                Uri.joinPath(baseWebAppUri, "resources", "css", "widgetname.css"),
                Uri.joinPath(baseWebAppUri, "resources", "css", `${widgetName}.css`)
            ),
            workspace.fs.rename(
                Uri.joinPath(baseWebAppUri, "resources", "js", "widgetname.js"),
                Uri.joinPath(baseWebAppUri, "resources", "js", `${widgetName}.js`)
            ),
            workspace.fs.writeFile(
                Uri.joinPath(widgetUri, '/src/main/webapp/WEB-INF/jboss-web.xml'),
                Buffer.from(readFileSync(Uri.joinPath(baseWebAppUri, "WEB-INF", "jboss-web.xml").fsPath, 'utf8').replace(/widgetname/g, widgetName), 'utf8')
            ),
            workspace.fs.writeFile(
                Uri.joinPath(widgetUri, '/src/main/resources/application.info'),
                Buffer.from(readFileSync(Uri.joinPath(baseResourcesUri, "application.info").fsPath, 'utf8').replace(/widgetname/g, widgetName), 'utf8')
            )
        );

        await Promise.all(promises);

        await workspace.fs.rename(basePropertiesUri, Uri.joinPath(baseResourcesUri, `${widgetName}.properties`));

        window.showTextDocument(widgetUriFile);
    }

    public static async export(fileUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        const widgetName: string = fileUri.path.replace(/.*\/widget\/([^/]+).*/, "$1");

        const widgetUri = Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName
        );

        const zipStream = new JSZip();
        zipStream.folder("WEB-INF");
        zipStream.folder("WEB-INF/classes");

        for (const filePath of glob.sync(Uri.joinPath(widgetUri, "src", "main", "webapp", "WEB-INF").fsPath + "/*.xml")) {
            zipStream.file("WEB-INF/" + basename(filePath), readFileSync(filePath, 'utf8'));
        }

        for (const filePath of glob.sync(Uri.joinPath(widgetUri, "src", "main", "resources").fsPath + "/*.*")) {
            zipStream.file("WEB-INF/classes/" + basename(filePath), readFileSync(filePath, 'utf8'));
        }

        async function addFolderFiles(folder: Uri, zipFolder: string) {
            zipStream.folder(zipFolder);

            for (const [name, type] of await workspace.fs.readDirectory(folder)) {
                const fileUri = Uri.joinPath(folder, name);
                const zipPath = `${zipFolder}/${name}`;

                if (type === FileType.Directory) {
                    await addFolderFiles(fileUri, zipPath);
                } else {
                    zipStream.file(zipPath, await workspace.fs.readFile(fileUri), { binary: true });
                }
            }
        }

        await addFolderFiles(Uri.joinPath(widgetUri, "src", "main", "webapp", "resources"), "resources");

        zipStream.generateAsync({
            type:'uint8array',
            compression: 'STORE',
            mimeType: 'application/java-archive',
        })
        .then(async function (content) {
            const url = `${UtilsService.getHost(server)}/portal/api/rest/wcmservice/rest/product/uploadfile/${server.username}/${Buffer.from(server.password).toString("base64")}`;

            const formData = new FormData();
            formData.append("fileName", `${widgetName}.war`);
            formData.append("fileDescription", "WCM Eclipse Plugin Deploy Artifact");
            formData.append("attachment", new Blob([content]), `${widgetName}.war`);

            try {
                const response:any = await fetch(
                    url,
                    {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            //'Cookie': await LoginService.loginAndGetCookies(server)
                        },
                        body: formData,
                    }
                ).then(r => {
                    if (!r.ok) {
                        throw new Error(`${r.status} - ${r.statusText}. Para Fluig anterior ao 1.8.2 utilize a versão antiga da Extensão.`);
                    }

                    return r.json();
                })


                if (response.message) {
                    window.showErrorMessage(response.message.message);
                } else {
                    window.showInformationMessage("Widget enviada com sucesso. Você será notificado assim que a instalação/atualização for concluída.");
                }
            } catch (error) {
                window.showErrorMessage(`Erro: ${error}`);
            }
        })
        .catch(e => window.showErrorMessage(`Erro: ${e}`));
    }

    /**
     * Import Widget
     * Criado por Daniel Bom conselho Sales em 20/03/2025
     * Este recurso nessecita da widget UWE 
     */
    public static async import() {
        const server = await ServerService.getSelect();
        console.log("import chamou.");
        if (!server) {
            return;
        }
        
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }
        console.log("import chamou 2.");
        let war = await WidgetService.getWarFileSelected(server);
        if (!war) {
            return;
        }

        const widgetUri = UtilsService.getRestUrl(server, basePathUWE,"getwarfile?war="+war);
        await fetch(
            widgetUri, // Use the URL as string, no need to create a new object.
            {
                method: "GET",
                headers: { 
                    "accept": "application/json", "content-type": "application/json",
                    'cookie': await LoginService.loginAndGetCookies(server)
                } 
            } // Add headers
        ).then(async (r) => {
            const text = await r.text(); // Get the response as text
            console.log("Dentro do then");
            try {
                console.log(text);
                const json = JSON.parse(text); // Try parsing as JSON
                console.clear();
                console.log(json.fileName+" - " + json.fileContentBase64);
                await WidgetService.saveBase64ToFile(json.fileContentBase64, json.fileName);
                await WidgetService.extractWarFile(json.fileName);

            } catch (e) {
                console.error("getwarlistile JSON Parse Error:", e); // Log any parsing error
                return text; // Return the text if parsing fails
            }
        }).catch((error) => {
            console.error("Fetch Error:", error); // Log any fetch errors
            throw error;
        });

    }

    /**
     * Import Widget
     * Criado por Daniel Bom conselho Sales em 20/03/2025
     * Esta função carrega a widget UWE no fluig para adicionar os novos recursos.
     */
    public static async exportWarFile(fileUri: Uri, server: any) {
        const fileContent = await workspace.fs.readFile(fileUri);
        const fileBlob = new Blob([fileContent]);
        const url = `${UtilsService.getHost(server)}/portal/api/rest/wcmservice/rest/product/uploadfile/${server.username}/${Buffer.from(server.password).toString("base64")}`;
        const formData = new FormData();
        formData.append("fileName", `UWE-1.0.war`);
        formData.append("fileDescription", "WCM Eclipse Plugin Deploy Artifact");
        formData.append("attachment", fileBlob, `UWE-1.0.war`);

        try {
            const response:any = await fetch(
                url,
                {
                    method: "POST",
                    headers: {
                        "accept": "application/json",
                        'cookie': await LoginService.loginAndGetCookies(server)
                    },
                    body: formData,
                }
            ).then(r => {
                if (!r.ok) {
                    throw new Error(`${r.status} - ${r.statusText}. Para Fluig anterior ao 1.8.2 não há suporte.`);
                }

                return r.json();
            });


            if (response.message) {
                window.showErrorMessage(response.message.message);
            } else {
                window.showInformationMessage("Widget enviada com sucesso. Você será notificado assim que a instalação/atualização for concluída.");
            }
        } catch (error) {
            window.showErrorMessage(`Erro: ${error}`);
        }

    }
    /**
     * 
     * @param server 
     * @returns 
     * Criado por Daniel Bom conselho Sales em 20/03/2025
     * Função para baixar o war do servidor do fluig.
     * Localisa todos os pacotes war contidos na pasta fluig/appserver/apps
     *  
     */
    
    public static async getWarFileSelected(server: ServerDTO) {
        const widgetUri = UtilsService.getRestUrl(server, basePathUWE,"warlistfile");
        let warLabels: QuickPickItem[] = [];
        await fetch(
            widgetUri, // Use the URL as string, no need to create a new object.
            {
                method: "GET",
                headers: { 
                    "accept": "application/json", "content-type": "application/json",
                    'cookie': await LoginService.loginAndGetCookies(server)
                } 
            } // Add headers
        ).then(async (r) => {
            const text = await r.text(); // Get the response as text
            console.log("Dentro do then");
            try {
                console.log(text);
                const json = JSON.parse(text); // Try parsing as JSON
                json.forEach((element: any) => {
                    warLabels.push({ label: element});
                    //console.log(element);
                });
            } catch (e) {
                console.error("getwarlistile JSON Parse Error:", e); // Log any parsing error
                return text; // Return the text if parsing fails
            }
        }).catch((error) => {
            console.error("Fetch Error:", error); // Log any fetch errors
            throw error;
        });

        const result = await window.showQuickPick(warLabels, {
            placeHolder: "Selecione o war a ser importado"
        });

        if (!result) {
            return false;
        }
        window.showInformationMessage("Você escolheu a widget "+result.label);
        return result.label;
    }

    /**
     * 
     * @param base64String 
     * @param fileName 
     * Criado por Daniel Bom conselho Sales em 20/03/2025
     * Salva o conteudo base64 recebido da UWE em um arquivo no disco.
     */

    public static async saveBase64ToFile(base64String: string, fileName: string) {
        try {
            //let fs: File;
            // Ensure the directory exists
            if (!fs.existsSync(warFolderPath)) {
                fs.mkdirSync(warFolderPath, { recursive: true });
            }

            const filePath = path.join(warFolderPath, fileName);
            const buffer = Buffer.from(base64String, 'base64');

            fs.writeFileSync(filePath, buffer);

            window.showInformationMessage(`Arquivo ${fileName} salvo em ${warFolderPath}`);
        } catch (error) {
            console.error("Erro ao salvar o arquivo:", error);
            window.showErrorMessage(`Erro ao salvar o arquivo: ${error}`);
        }
    }

    /**
     * 
     * @param fileName 
     * Criado por Daniel Bom conselho Sales em 20/03/2025
     * Descompacta war na pasta de widgets do projeto o arquivo WAR fica na raiz da pasta Widget e é criada um pasta scom o conteudo da widget.
     * O psdrão nesta pasta não segue o mesmo padrão de quando se cria uma widget nova. Caso tenha desenvovimento java esté não tem o seu fonte extraido.
     * Para voltar as classes java ao fonte original favor usar um descompilador java. 
     */

    public static async extractWarFile(fileName: string) {
        console.log("extractWarFile chamou.");
        const extractPath = path.join(warFolderPath, fileName.replace(".war", "")); // Create a folder with the same name as the WAR file (without .war)
        const filePath = path.join(warFolderPath, fileName);

        try {
            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }

            const data = fs.readFileSync(filePath);
            const zip = await JSZip.loadAsync(data);
            await Promise.all(
                Object.keys(zip.files).map(async (relativePath) => {
                    const zipEntry = zip.files[relativePath];
                    const fullPath = path.join(extractPath, relativePath);
                    const fullDirPath = path.dirname(fullPath); // Get the directory path
                    
                    if (!fs.existsSync(fullDirPath)) {
                        fs.mkdirSync(fullDirPath, { recursive: true }); // Create the directory if it doesn't exist
                        console.log("extractWarFile create dir: ", fullDirPath);
                    }
    
                    if (!zipEntry.dir) {
                        console.log("extractWarFile chamou 3.");
                        const content = await zipEntry.async("nodebuffer");
                        console.log("extractWarFile chamou 4.");
                        fs.writeFileSync(fullPath, content);
                    }
                })
            );

            window.showInformationMessage(`Arquivo ${fileName} descompactado em ${extractPath}`);
        } catch (error) {
            console.error("Erro ao descompactar o arquivo:", error);
            window.showErrorMessage(`Erro ao descompactar o arquivo: ${error}`);
        }
    }
}
