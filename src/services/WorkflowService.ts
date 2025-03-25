import { ServerService } from "./ServerService";
import { UtilsService } from "./UtilsService";
import { window, workspace, Uri } from "vscode";
import { WidgetService } from "./WidgetService";
import { TemplateService } from "./TemplateService";
import * as vscode from 'vscode';
import * as path from 'path';
import { LoginService } from "./LoginService";

const basePathUWE = "/UWE/rest/conn";
const basePath = "/page-management/api/v2/applications/";

export class WorkflowService {
    /**
     * 
     * @param fileUri 
     * @returns 
     * Criado em 10/03/2025 por Daniel Bom conselho Sales
     */
    public static async update(fileUri: Uri) {
        let fileName = path.basename(fileUri.fsPath); // Obtém apenas o nome do arquivo
        console.clear();
        console.log(fileName);
        const server = await ServerService.getSelect();
        if(!server){
            window.showErrorMessage("No server selected.");
            return;
        }
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }
        try {
            //Verifica se widget UWE está carregada no servidor
            let resposta = await UtilsService.checkUWE(server);            
            if(resposta.code === "com.fluig.wcm.core.exception.ApplicationNotFoundException"){
                // Add confirmation modal here
                const confirmExport = await window.showQuickPick(["Sim", "Não"], {
                    placeHolder: "Para usar este recurso é necessário que você exporte o artefato UWE-1.0.war. Deseja continuar?",
                    canPickMany: false
                });

                if (confirmExport !== "Sim") {
                    window.showInformationMessage("Exportação cancelada.");
                    return;
                }
                let uweFile =Uri.joinPath(
                    TemplateService.templatesUri,
                    "UWE-1.0.war"
                );
                console.log(uweFile.path);
                WidgetService.exportWarFile(uweFile,server);
            }

            //Aqui o conteudo do arquivo vira base64
            const base64Content = await WorkflowService.fileToBase64(fileUri);

            let coddefprocess=fileName.split(".")[0];
            let url = new URL(UtilsService.getHost(server)+basePathUWE+"/getworkflowsversion?CODDEFPROCESS="+coddefprocess);

            const response:any = await fetch(
                url,
                {
                    method: "GET",
                    headers: { 
                        "accept": "application/json", "content-type": "application/json",
                        'cookie': await LoginService.loginAndGetCookies(server)
                    } 
                }
            ).then(async (r) => {
                const text = await r.text(); // Get the response as text
                console.clear();
                console.log(text);
                try {
                    const json = JSON.parse(text); // Try parsing as JSON
                    if (r.status !== 200) {
                        window.showErrorMessage(r.statusText);
                    } else {
                        console.log("r.status: " + r.status);
                        window.showInformationMessage(json.VERSAO_ATUAL);

                    }
                    return json.VERSAO_ATUAL;
                } catch (e) {
                    console.error("checkUWE JSON Parse Error:", e); // Log any parsing error
                    return text; // Return the text if parsing fails
                } finally{
                    
                }
            });
            let url2 = new URL(UtilsService.getHost(server)+basePathUWE+"/updateworkflowevent");
            let body={
                "DSL_EVENT" : base64Content,
                "COD_DEF_PROCES" : fileName.split(".")[0],
                "COD_EVENT" : fileName.split(".")[1],
                "NUM_VERS" : response
            };
            console.clear();
            console.log(body);

            const response2:any = await fetch(
                url2,
                {
                    method: "POST",
                    body: JSON.stringify(body),
                    headers: { 
                        "accept": "application/json", "content-type": "application/json",
                        'cookie': await LoginService.loginAndGetCookies(server)
                    } 
                }
            );
        } catch (error) {
            window.showErrorMessage(`Erro: ${error}`);
        }

    }

    public static async fileToBase64(fileUri: Uri): Promise<string> {
        try {
            const fileContent = await workspace.fs.readFile(fileUri);
            const base64 = Buffer.from(fileContent).toString("base64");
            return base64;
        } catch (error) {
            console.error("Error reading or encoding file:", error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }
}
