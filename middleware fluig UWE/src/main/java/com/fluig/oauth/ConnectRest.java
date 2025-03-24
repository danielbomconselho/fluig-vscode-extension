
package com.fluig.oauth;
import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.*;
import java.util.Base64;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.servlet.ServletContext;
import javax.servlet.http.HttpServletRequest;
import javax.sql.DataSource;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.QueryParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import org.json.*;
import com.fluig.Logs.Log;

@Path("/conn")
public class ConnectRest {

	/* Como chamar via postman
	 * Use esta URL: https://serverUrl/UWS/rest/conn/updateworkflowevent
	 * 
    **/
    
    public static final String endPoint = "/portal/p/api/servlet/ping"; 

    @Context
    private ServletContext context; // Inject the ServletContext
    @POST
    @Path("/updateworkflowevent")
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    public Response updateworkflowscript(String requestBody, @Context HttpServletRequest request) throws IOException, SQLException, NamingException{
		final Log log = new Log();
		log.info("webhook: " + requestBody);
        String cookie = request.getHeader("Cookie");
        if(checkLoginPassword(cookie, null)==0){
            return Response.status(Response.Status.UNAUTHORIZED).entity("Unauthorized").build();
        }
        Connection conn = null;
		Statement stmt = null;
		ResultSet rs = null;
		InitialContext ic = null;
		DataSource ds = null;
		
        try{
            // Parse the JSON request body
            JSONObject jsonBody = new JSONObject(requestBody);
			// Accessing properties:
            String DSL_EVENT_64 = jsonBody.getString("DSL_EVENT");//in base64
            String COD_DEF_PROCES = jsonBody.getString("COD_DEF_PROCES");
            String COD_EVENT = jsonBody.getString("COD_EVENT");
            int NUM_VERS = jsonBody.getInt("NUM_VERS");
        

            // Decode the Base64 string
            byte[] decodedBytes = Base64.getDecoder().decode(DSL_EVENT_64);

            // Convert the decoded bytes to a string
            String DSL_EVENT = new String(decodedBytes);
        
            String QUERY="UPDATE ESTADO_PROCES SET DSL_EVENT=( SELECT CAST(CAST(N'' AS XML).value('xs:base64Binary(\""+DSL_EVENT+"\")', 'VARBINARY(MAX)')AS VARCHAR(MAX)) ) WHERE NUM_VERS= "+NUM_VERS+"AND COD_DEF_PROCES='"+COD_DEF_PROCES+"' AND COD_EVENT='"+COD_EVENT+"';";
            log.info("Query: "+QUERY);
            
            String dataSource = "/jdbc/AppDS";
            ic = new javax.naming.InitialContext();
            ds = (DataSource) ic.lookup(dataSource);
            conn = ds.getConnection();
            stmt = conn.createStatement();
            
            //the executeUpdate will update the database and return the number of rows changed.
			int rowsUpdated = stmt.executeUpdate(QUERY);
            
            JSONObject responseBody = new JSONObject();
			if(rowsUpdated>0){
				responseBody.put("message", "Workflow updated successfully");
			}else{
				responseBody.put("message", "No rows updated. Check the parameters, maybe the name are already used.");
			}

			Response.ResponseBuilder builder = Response.ok(responseBody.toString());
		 	Response respostaFinal = builder.build();
			return respostaFinal;
		} catch (Exception e){
            log.error("Error during database operation: " + e.getMessage());
			e.printStackTrace();
            Response.ResponseBuilder builder = Response.ok("DErro: " + e);
            Response respostaFinal = builder.build();
            return respostaFinal;
    
		}finally {
        	// Certifique-se de fechar a conexão após o uso
        	if (rs != null) {
                rs.close();
            }
            if (stmt != null) {
                stmt.close();
            }
            if (conn != null) {
                conn.close();
            }
            if (ic != null) {
                ic.close();
            }
        }
    }
    @GET
    @Path("/getworkflowsversion")
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    public Response getworkflowversion(@QueryParam("CODDEFPROCESS") String CODDEFPROCESS,String requestBody, @Context HttpServletRequest request) throws IOException, SQLException, NamingException{
		final Log log = new Log();
		log.info("webhook: " + CODDEFPROCESS);
        String cookie = request.getHeader("Cookie");
        if(checkLoginPassword(cookie, request)==0){
            return Response.status(Response.Status.UNAUTHORIZED).entity("Unauthorized").build();
        }

        Connection conn = null;
		Statement stmt = null;
		ResultSet rs = null;
		InitialContext ic = null;
		DataSource ds = null;
		
        try{

            String QUERY="SELECT MAX(NUM_VERS) VERSAO_ATUAL FROM ESTADO_PROCES WHERE COD_DEF_PROCES = '"+CODDEFPROCESS+"';";
            log.info("Query: "+QUERY);
            
            String dataSource = "/jdbc/AppDS";
            ic = new javax.naming.InitialContext();
            ds = (DataSource) ic.lookup(dataSource);
            conn = ds.getConnection();
            stmt = conn.createStatement();
            
            //the executeQuery will show max version of a process.
			rs = stmt.executeQuery(QUERY);
            JSONObject responseBody = new JSONObject();
            while (rs.next()) {
                responseBody.put("VERSAO_ATUAL", rs.getInt("VERSAO_ATUAL"));
            }

			Response.ResponseBuilder builder = Response.ok(responseBody.toString());
		 	Response respostaFinal = builder.build();
			return respostaFinal;
		} catch (Exception e){
            log.error("Error during database operation: " + e.getMessage());
			e.printStackTrace();
            Response.ResponseBuilder builder = Response.ok("DErro: " + e);
            Response respostaFinal = builder.build();
            return respostaFinal;
    
		}finally {
        	// Certifique-se de fechar a conexão após o uso
        	if (rs != null) {
                rs.close();
            }
            if (stmt != null) {
                stmt.close();
            }
            if (conn != null) {
                conn.close();
            }
            if (ic != null) {
                ic.close();
            }
        }
    }

    @GET
    @Path("/warlistfile")
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    public Response warlistfile(String requestBody, @Context HttpServletRequest request) throws IOException, NamingException, SQLException{
		final Log log = new Log();
		log.info("webhook: ");
        String cookie = request.getHeader("Cookie");
        if(checkLoginPassword(cookie, request)==0){
            return Response.status(Response.Status.UNAUTHORIZED).entity("Unauthorized").build();
        }

        try{
            // pegue o caminho real do web application's root directory
            String webAppPath = context.getRealPath("/");
            log.info("Web Application Root Path: " + webAppPath);
            String[] parts = webAppPath.split("\\bappserver\\b");
            String sistemaOperacional = System.getProperty("os.name").toLowerCase();
            String baseDir="";
            if (sistemaOperacional.contains("win")) {
                log.info("O WildFly está rodando em um sistema Windows.");
                log.info("Part 0: " + parts[0]+"appserver\\apps\\");
                baseDir = parts[0]+"appserver\\apps\\";
            } else if (sistemaOperacional.contains("nix") || sistemaOperacional.contains("nux") || sistemaOperacional.contains("mac")) {
                log.info("O WildFly está rodando em um sistema baseado em Unix/Linux.");
                log.info("Part 0: " + parts[0]+"appserver/apps/");
                baseDir = parts[0]+"appserver/apps/";
            }
            
            
            // Converte o caminho em um objeto de diretorio
            File webAppDir = new File(baseDir);

            // List files and directories within the appserver directory
            File[] files = webAppDir.listFiles();
            JSONArray fileList = new JSONArray();
            if (files != null) {
                for (File file : files) {
                    //fileList.put(file.getAbsolutePath());
                    fileList.put(file.getName());
                }
            }
            
			Response.ResponseBuilder builder = Response.ok(fileList.toString());
		 	Response respostaFinal = builder.build();
			return respostaFinal;
		} catch (Exception e){
            Response.ResponseBuilder builder = Response.ok("DErro: " + e);
            Response respostaFinal = builder.build();
            return respostaFinal;
    
		}finally {

        }
    }

    @GET
    @Path("/getwarfile")
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    public Response getwarfile(@QueryParam("war") String war,String requestBody, @Context HttpServletRequest request) throws IOException, NamingException, SQLException{
		final Log log = new Log();
		log.info("webhook: ");
        String cookie = request.getHeader("Cookie");
        
        if(checkLoginPassword(cookie, request)==0){
            return Response.status(Response.Status.UNAUTHORIZED).entity("Unauthorized").build();
        }

        try{
            // pegue o caminho real do web application's root directory
            String webAppPath = context.getRealPath("/");
            log.info("Web Application Root Path: " + webAppPath);
            String[] parts = webAppPath.split("\\bappserver\\b");
            String sistemaOperacional = System.getProperty("os.name").toLowerCase();
            String baseDir="";
            if (sistemaOperacional.contains("win")) {
                log.info("O WildFly está rodando em um sistema Windows.");
                log.info("Part 0: " + parts[0]+"appserver\\apps\\");
                baseDir = parts[0]+"appserver\\apps\\";
            } else if (sistemaOperacional.contains("nix") || sistemaOperacional.contains("nux") || sistemaOperacional.contains("mac")) {
                log.info("O WildFly está rodando em um sistema baseado em Unix/Linux.");
                log.info("Part 0: " + parts[0]+"appserver/apps/");
                baseDir = parts[0]+"appserver/apps/";
            }
            
            // Converte o caminho em um objeto de diretorio
            File webAppDir = new File(baseDir);
            File targetFile = null;
            // List files and directories within the appserver directory
            File[] files = webAppDir.listFiles();
            if (files != null) {
                for (File file : files) {
                    if(file.getName().equals(war)){
                        file.getAbsolutePath();
                        targetFile = file;
                        break;
                    }
                }
            }
            if (targetFile == null) {
                return Response.status(Response.Status.NOT_FOUND).entity("File not found: " + war).build();
            }
            // Leia o conteudo do arquivo em um byte array
            byte[] fileContent = Files.readAllBytes(Paths.get(targetFile.getAbsolutePath()));

            // converte para Base64
            String base64EncodedFile = Base64.getEncoder().encodeToString(fileContent);
            
            // Resposta final com o base64
            JSONObject responseBody = new JSONObject();
            responseBody.put("fileName", targetFile.getName());
            responseBody.put("fileContentBase64", base64EncodedFile);

            Response.ResponseBuilder builder = Response.ok(responseBody.toString());
            Response respostaFinal = builder.build();
            return respostaFinal;
		} catch (Exception e){
            Response.ResponseBuilder builder = Response.ok("DErro: " + e);
            Response respostaFinal = builder.build();
            return respostaFinal;
    
		}finally {

        }
    }

    public int checkLoginPassword(String cookie,HttpServletRequest request) throws SQLException, NamingException{
		final Log log = new Log();
        log.info("checkLoginPassword: chamada");
        int verdade = 0;
        try {
            // Check if the cookie is valid.
            if (cookie == null || cookie.trim().isEmpty()) {
                log.error("Cookie is null or empty.");
                return 0;
            }
            // Obtém o esquema (http/https)
            String scheme = request.getScheme();
            // Obtém o nome do host
            String serverName = request.getServerName();
            // Obtém a porta do servidor
            int serverPort = request.getServerPort();

            // Monta o URL base
            String baseUrl = scheme + "://" + serverName;

            // Adiciona a porta, caso não seja a padrão (80 para HTTP e 443 para HTTPS)
            if ((scheme.equals("http") && serverPort != 80) || (scheme.equals("https") && serverPort != 443)) {
                baseUrl += ":" + serverPort;
            }

            log.info("baseUrl: " + baseUrl);
            String pingUrl = baseUrl + endPoint;
            
            // Criando o cliente HTTP
            HttpURLConnection conn = (HttpURLConnection) new URL(pingUrl).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Cookie", cookie);
            conn.connect();
            int responseCode = conn.getResponseCode();
            if (responseCode == 200) {
                verdade = 1;
            } else {
                verdade = 0;
            }
            conn.disconnect();

        } catch (Exception e) {
            e.printStackTrace();
        }
        return verdade;
    }

}