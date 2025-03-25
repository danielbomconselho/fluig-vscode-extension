import * as vscode from 'vscode';
import { ServerDTO } from '../models/ServerDTO';
import { LoginService } from './LoginService';

export class UtilsService {
    public static generateRandomID() {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
    }

    /**
     * Retorna o PATH do workspace
     */
    public static getWorkspaceUri(): vscode.Uri {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error("É necessário estar em Workspace / Diretório.");
        }
        return vscode.workspace.workspaceFolders[0].uri;
    }

    public static getHost(server: ServerDTO): string {
        const schema: string = server.ssl ? "https" : "http";
        const port: string = [80, 443].includes(server.port) ? "" : `:${server.port}`;

        return `${schema}://${server.host}${port}`;
    }

    /**
     * Pega a URL para um serviço REST já com usuário e senha do servidor
     *
     * @param server Servidor selecionado
     * @param basePath Caminho base do recurso REST (ex: /ecm/api/rest/ecm/dataset/)
     * @param resource Recurso solicitado (ex: loadDataset)
     * @param params Objeto com parâmetros adicionais para inserir na Url
     */
    public static getRestUrl(server: ServerDTO, basePath: string, resource: string, params?: {[s: string]: string}): URL {
        const url = new URL(`${UtilsService.getHost(server)}${basePath}${resource}`);

        if (!params) {
            return url;
        }

        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        return url;
    }

    /**
     * Confirma a senha do servidor para exportar artefatos
     */
    public static async confirmPassword(server: ServerDTO): Promise<boolean> {
        let isPasswordCorrect: boolean = true;

        do {
            const confirmPassword = await vscode.window.showInputBox({
                prompt: "Informe a senha do servidor " + server.name,
                password: true
            }) || "";

            if (!confirmPassword) {
                return false;
            } else if (confirmPassword !== server.password) {
                vscode.window.showWarningMessage(`A senha informada para o servidor "${server.name}" está incorreta!`);
                isPasswordCorrect = false;
            } else {
                isPasswordCorrect = true;
            }
        } while (!isPasswordCorrect);

        return isPasswordCorrect;
    }

    /**
     * 
     * @param server 
     * @returns 
     * Criado por Daniel Bom Conselho Sales 10/03/2025
     * Consulta o servidor do fluig e verifica se a widget UWE esta carregada no servidor.
     */
    public static async checkUWE(server: ServerDTO):Promise<any> {
        const basePath = "/page-management/api/v2/applications/";    
        const url = UtilsService.getRestUrl(server, basePath, "UWE"); // corrected base path
            console.log("checkUWE URL:", url.toString()); // Log the URL
            return await fetch(
                url, // Use the URL as string.
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
