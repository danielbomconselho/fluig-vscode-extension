import { ServerService } from "./ServerService";
import { UtilsService } from "./UtilsService";
import { window, workspace, Uri } from "vscode";
import { ServerDTO } from "../models/ServerDTO";
import { readFileSync } from "fs";
import { LoginService } from "./LoginService";
import { WidgetService } from "./WidgetService";
import { TemplateService } from "./TemplateService";

const basePathUWE = "/UWE/rest/conn/";
const basePath = "/page-management/api/v2/applications/";

const headers = new Headers();
headers.append("content-type", "application/json");
headers.append("accept-encoding","gzip, deflate, br, zstd");


export class WorkflowService {
    /**
     * 
     * @param fileUri 
     * @returns 
     * Criado em 10/03/2025 por Daniel Bom conselho Sales
     */
    public static async update(fileUri: Uri) {
      
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
            resposta = JSON.parse(resposta);
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
                console.log("aqui");
                let uweFile =Uri.joinPath(
                    TemplateService.templatesUri,
                    "UWE-1.0.war"
                );
                console.log(uweFile.path);
                WidgetService.exportWarFile(uweFile,server);
            }
            const base64Content = await WorkflowService.fileToBase64(fileUri);
            //console.log("File Content (Base64):", base64Content);
            
            /*
            const response:any = await fetch(
                url,
                {
                    method: "GET",
                    headers: headers
                }
            ).then(r => r.json());
            
            if (response.message) {
                window.showErrorMessage(response.code);
            } else {
                window.showInformationMessage(response.code);
            }
            */
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
