"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");

const projectRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(projectRoot, "runtime");
const javaMajor = Number(process.env.FLUIG_BUNDLED_JAVA_MAJOR || 17);

const studioBundlePrefixes = [
    "com.totvs.tds.ecm.designer.export.bpmn20_",
    "com.totvs.tds.ecm.designer.model_",
    "com.totvs.tds.ecm.designer.eclipse_",
    "com.totvs.tds.ecm_",
    "com.ibm.icu_",
    "org.apache.felix.gogo.command_",
    "org.apache.xerces_",
    "org.eclipse.core.runtime_",
    "org.eclipse.emf.common_",
    "org.eclipse.emf.ecore.xmi_",
    "org.eclipse.emf.ecore_",
    "org.eclipse.equinox.common_",
    "org.eclipse.graphiti.mm_",
    "org.eclipse.osgi_",
];

function parseArguments(argv) {
    const options = {
        platform: process.platform,
        arch: process.arch,
        force: false,
        check: false,
        javaOnly: false,
        studioOnly: false,
        eclipsePlugins: process.env.FLUIG_ECLIPSE_PLUGINS || "",
    };
    for (const argument of argv) {
        if (argument === "--force") options.force = true;
        else if (argument === "--check") options.check = true;
        else if (argument === "--java-only") options.javaOnly = true;
        else if (argument === "--studio-only") options.studioOnly = true;
        else if (argument.startsWith("--platform=")) options.platform = argument.slice(11);
        else if (argument.startsWith("--arch=")) options.arch = argument.slice(7);
        else if (argument.startsWith("--eclipse-plugins=")) options.eclipsePlugins = argument.slice(18);
        else throw new Error(`Argumento desconhecido: ${argument}`);
    }
    if (options.javaOnly && options.studioOnly) {
        throw new Error("Use apenas um entre --java-only e --studio-only.");
    }
    return options;
}

function platformDescriptor(platform, arch) {
    const osNames = { win32: "windows", linux: "linux", darwin: "mac" };
    const archNames = { x64: "x64", arm64: "aarch64" };
    if (!osNames[platform] || !archNames[arch]) {
        throw new Error(`Runtime Java nao suportado: ${platform}-${arch}.`);
    }
    return {
        apiOs: osNames[platform],
        apiArch: archNames[arch],
        archiveType: platform === "win32" ? "zip" : "tar.gz",
        executable: platform === "win32" ? "java.exe" : "java",
        key: `${platform}-${arch}`,
    };
}

function sha256(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { "user-agent": "fluiggers-fluig-vscode-extension-runtime-builder" },
    });
    if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status} ao consultar ${url}.`);
    }
    return response.json();
}

async function download(url) {
    const response = await fetch(url, {
        headers: { "user-agent": "fluiggers-fluig-vscode-extension-runtime-builder" },
    });
    if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status} ao baixar ${url}.`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function extractZip(content, destination) {
    const archive = await JSZip.loadAsync(content);
    for (const entry of Object.values(archive.files)) {
        if (entry.dir) continue;
        const target = path.resolve(destination, ...entry.name.split("/").filter(Boolean));
        if (!target.startsWith(path.resolve(destination) + path.sep)) {
            throw new Error(`Entrada ZIP insegura: ${entry.name}`);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, await entry.async("nodebuffer"));
    }
}

function findJavaHome(directory, executable, depth = 0) {
    if (depth > 4 || !fs.existsSync(directory)) return undefined;
    if (fs.existsSync(path.join(directory, "bin", executable))) return directory;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const found = findJavaHome(path.join(directory, entry.name), executable, depth + 1);
        if (found) return found;
    }
    return undefined;
}

async function prepareJava(options) {
    const descriptor = platformDescriptor(options.platform, options.arch);
    const destination = path.join(runtimeRoot, "java", descriptor.key);
    const javaExecutable = path.join(destination, "bin", descriptor.executable);
    if (!options.force && fs.existsSync(javaExecutable)) {
        console.log(`Java empacotado ja existe: ${javaExecutable}`);
        return;
    }

    const apiUrl = [
        `https://api.adoptium.net/v3/assets/latest/${javaMajor}/hotspot`,
        `?architecture=${descriptor.apiArch}`,
        "&image_type=jre",
        `&os=${descriptor.apiOs}`,
        "&vendor=eclipse",
    ].join("");
    const assets = await fetchJson(apiUrl);
    const asset = assets.find(item => item?.binary?.package?.link)?.binary;
    if (!asset) {
        throw new Error(`Adoptium nao retornou um JRE ${javaMajor} para ${descriptor.key}.`);
    }

    console.log(`Baixando ${asset.package.name}...`);
    const content = await download(asset.package.link);
    const actualChecksum = sha256(content);
    if (asset.package.checksum && actualChecksum !== asset.package.checksum.toLowerCase()) {
        throw new Error(
            `Checksum invalido para ${asset.package.name}: esperado ${asset.package.checksum}, ` +
            `recebido ${actualChecksum}.`
        );
    }

    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fluig-bundled-java-"));
    const extracted = path.join(temporaryRoot, "extracted");
    fs.mkdirSync(extracted, { recursive: true });
    try {
        if (descriptor.archiveType === "zip") {
            await extractZip(content, extracted);
        } else {
            const archivePath = path.join(temporaryRoot, asset.package.name);
            fs.writeFileSync(archivePath, content);
            childProcess.execFileSync("tar", ["-xzf", archivePath, "-C", extracted], {
                stdio: "inherit",
            });
        }
        const javaHome = findJavaHome(extracted, descriptor.executable);
        if (!javaHome) {
            throw new Error(`Executavel Java nao encontrado em ${asset.package.name}.`);
        }
        fs.rmSync(destination, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(javaHome, destination, { recursive: true });
        if (options.platform !== "win32") {
            fs.chmodSync(javaExecutable, 0o755);
        }
        fs.writeFileSync(path.join(destination, "runtime.json"), JSON.stringify({
            vendor: "Eclipse Temurin",
            javaMajor,
            platform: options.platform,
            arch: options.arch,
            package: asset.package.name,
            checksum: actualChecksum,
            source: asset.package.link,
        }, null, 2));
        console.log(`Java preparado em ${destination}`);
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
}

function findPluginsDirectory(configuredPath) {
    const configuredCandidates = configuredPath
        ? (path.basename(path.resolve(configuredPath)).toLowerCase() === "plugins"
            ? [configuredPath]
            : [path.join(configuredPath, "plugins"), configuredPath])
        : [];
    const candidates = [
        ...configuredCandidates,
        path.join(os.homedir(), "EclipsePortable", "App", "eclipse", "plugins"),
        path.join(os.homedir(), "eclipse", "plugins"),
    ];
    return candidates.find(candidate => {
        try {
            return fs.statSync(candidate).isDirectory() &&
                studioBundlePrefixes.slice(0, 4).every(prefix => (
                    Boolean(selectLatestBundle(candidate, prefix))
                ));
        } catch (_error) {
            return false;
        }
    });
}

function selectLatestBundle(pluginsDirectory, prefix) {
    return fs.readdirSync(pluginsDirectory)
        .filter(name => name.startsWith(prefix) && name.endsWith(".jar"))
        .sort((left, right) => right.localeCompare(left, "en", { numeric: true }))[0];
}

function prepareStudio(options) {
    const pluginsDirectory = findPluginsDirectory(options.eclipsePlugins);
    if (!pluginsDirectory) {
        throw new Error(
            "Plugins do Fluig Studio nao encontrados. Informe FLUIG_ECLIPSE_PLUGINS " +
            "ou --eclipse-plugins=<pasta>."
        );
    }
    const selected = studioBundlePrefixes.map(prefix => {
        const name = selectLatestBundle(pluginsDirectory, prefix);
        if (!name) throw new Error(`Dependencia do Fluig Studio nao encontrada: ${prefix}*.jar`);
        return name;
    });

    const destination = path.join(runtimeRoot, "fluig-studio", "plugins");
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    const files = selected.map(name => {
        const source = path.join(pluginsDirectory, name);
        const target = path.join(destination, name);
        fs.copyFileSync(source, target);
        return { name, sha256: sha256(fs.readFileSync(target)), bytes: fs.statSync(target).size };
    });
    fs.writeFileSync(path.join(runtimeRoot, "fluig-studio", "runtime.json"), JSON.stringify({
        sourceDirectory: pluginsDirectory,
        files,
    }, null, 2));
    fs.writeFileSync(
        path.join(runtimeRoot, "fluig-studio", "REDISTRIBUTION-NOTICE.txt"),
        [
            "This folder contains files copied from a locally installed TOTVS Fluig Studio.",
            "Confirm that your TOTVS license permits redistribution before sharing the VSIX.",
            "The build does not download TOTVS proprietary artifacts from the internet.",
            "",
        ].join("\n")
    );
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    console.log(`Fluig Studio preparado: ${files.length} JARs, ${(total / 1024 / 1024).toFixed(2)} MB.`);
}

function checkRuntime(options) {
    const descriptor = platformDescriptor(options.platform, options.arch);
    const javaExecutable = path.join(
        runtimeRoot,
        "java",
        descriptor.key,
        "bin",
        descriptor.executable
    );
    if (!fs.existsSync(javaExecutable)) throw new Error(`Java empacotado ausente: ${javaExecutable}`);
    const plugins = path.join(runtimeRoot, "fluig-studio", "plugins");
    for (const prefix of studioBundlePrefixes) {
        if (!selectLatestBundle(plugins, prefix)) {
            throw new Error(`JAR empacotado ausente: ${prefix}*.jar`);
        }
    }
    console.log(`Runtime autocontido valido para ${descriptor.key}.`);
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.check) {
        checkRuntime(options);
        return;
    }
    if (!options.javaOnly) prepareStudio(options);
    if (!options.studioOnly) await prepareJava(options);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

module.exports = {
    parseArguments,
    platformDescriptor,
    selectLatestBundle,
    studioBundlePrefixes,
};
