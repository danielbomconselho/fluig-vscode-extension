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
    public static async update(fileUri: Uri) {
        //console.log("update 1");        
        const server = await ServerService.getSelect();
        if(!server){
            window.showErrorMessage("No server selected.");
            return;
        }
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }
        try {
            let resposta = await this.checkUWE(server);
            resposta = JSON.parse(resposta);
            if(resposta.code === "com.fluig.wcm.core.exception.ApplicationNotFoundException"){
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

    public static async checkUWE(server: ServerDTO):Promise<any> {
        const url = UtilsService.getRestUrl(server, basePath, "UWE2"); // corrected base path
        console.log("checkUWE URL:", url.toString()); // Log the URL
        return await fetch(
            url, // Use the URL as string, no need to create a new object.
            {
                method: "GET",
                headers: { 
                    "accept": "application/json", "content-type": "application/json",
                    'cookie': await LoginService.loginAndGetCookies(server)
                } 
            } // Add headers
        ).then(async (r) => {
            const text = await r.text(); // Get the response as text
            try {
                if(r.status===404){
                    throw new Error("404 - Widget não encontrada.");
                }
                console.log(text);
                const json = JSON.parse(text); // Try parsing as JSON
                return json;
            } catch (e) {
                console.error("checkUWE JSON Parse Error:", e); // Log any parsing error
                return text; // Return the text if parsing fails
            }
        })
        .catch((error) => {
            console.error("checkUWE Fetch Error:", error); // Log any fetch errors
            throw error;
        });
    }
}
