const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    REQUIRED_BUNDLES,
    assertEcm30,
    assertMarshallerPreconditions,
    bundledJavaExecutable,
    findEclipsePluginsDirectory,
    generateEcm30Artifact,
    javaArguments,
    parseJavaMajorVersion,
    resolveJavaExecutable,
    writeEcm30Artifact,
} = require("../src/services/Ecm30GenerationService");

function temporaryDirectory(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecm30-generation-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

function fakePlugins(directory) {
    fs.mkdirSync(directory, { recursive: true });
    for (const prefix of REQUIRED_BUNDLES) {
        fs.writeFileSync(path.join(directory, `${prefix}1.8.2.2.jar`), "jar");
    }
}

test("descobre a pasta plugins configurada ou no EclipsePortable", t => {
    const root = temporaryDirectory(t);
    const configured = path.join(root, "custom", "plugins");
    fakePlugins(configured);
    assert.equal(findEclipsePluginsDirectory({ configuredPath: configured }), configured);

    const portable = path.join(root, "EclipsePortable", "App", "eclipse", "plugins");
    fakePlugins(portable);
    assert.equal(findEclipsePluginsDirectory({ homeDirectory: root }), portable);
});

test("usa plugins empacotados antes do EclipsePortable", t => {
    const root = temporaryDirectory(t);
    const bundled = path.join(root, "extension", "runtime", "fluig-studio", "plugins");
    const portable = path.join(root, "EclipsePortable", "App", "eclipse", "plugins");
    fakePlugins(bundled);
    fakePlugins(portable);
    assert.equal(findEclipsePluginsDirectory({ bundledPath: bundled, homeDirectory: root }), bundled);
});

test("resolve Java configurado, empacotado e fallback do sistema", t => {
    const root = temporaryDirectory(t);
    const bundled = path.join(root, "runtime", "java", "win32-x64", "bin", "java.exe");
    fs.mkdirSync(path.dirname(bundled), { recursive: true });
    fs.writeFileSync(bundled, "java");

    assert.equal(
        bundledJavaExecutable(root, "win32", "x64"),
        bundled
    );
    assert.equal(
        resolveJavaExecutable({
            configuredPath: "java",
            extensionDirectory: root,
            platform: "win32",
            arch: "x64",
        }),
        bundled
    );
    assert.equal(
        resolveJavaExecutable({
            configuredPath: "C:\\Java\\bin\\java.exe",
            extensionDirectory: root,
            platform: "win32",
            arch: "x64",
        }),
        "C:\\Java\\bin\\java.exe"
    );
    assert.equal(
        resolveJavaExecutable({
            extensionDirectory: path.join(root, "missing"),
            platform: "win32",
            arch: "x64",
        }),
        "java"
    );
});

test("interpreta versoes Java antigas e modernas", () => {
    assert.equal(parseJavaMajorVersion('java version "1.8.0_401"'), 8);
    assert.equal(parseJavaMajorVersion('openjdk version "17.0.12"'), 17);
    assert.equal(parseJavaMajorVersion('openjdk version "21"'), 21);
});

test("adiciona --add-opens somente no Java 9 ou superior", () => {
    const base = {
        bridgeClassesDirectory: "classes",
        pluginsDirectory: "plugins",
        xstreamJar: "xstream.jar",
        processPath: "processo.process",
        temporaryOutput: "processo.ecm30.xml",
        serverVersion: "1.8.2",
    };
    assert.equal(javaArguments({ ...base, javaMajorVersion: 8 })[0], "-cp");
    assert.match(javaArguments({ ...base, javaMajorVersion: 17 })[0], /^--add-opens=/);
});

test("valida a estrutura minima do ECM30", () => {
    assert.doesNotThrow(() => assertEcm30(
        "<list><ProcessDefinition></ProcessDefinition><ProcessDefinitionVersion></ProcessDefinitionVersion></list>"
    ));
    assert.throws(() => assertEcm30("<xmi:XMI></xmi:XMI>"), /raiz <list>/);
    assert.throws(() => assertEcm30("<list></list>"), /definicao e a versao/);
});

test("explica a precondicao de saida das atividades manuais", t => {
    const root = temporaryDirectory(t);
    const processPath = path.join(root, "processo.process");
    fs.writeFileSync(processPath, [
        "<xmi:XMI xmlns:bpmn2=\"http://www.omg.org/spec/BPMN/20100524/MODEL-XMI\">",
        "<bpmn2:BpmnTask id=\"manualtask32\" type=\"85\"/>",
        "</xmi:XMI>",
    ].join(""));
    assert.throws(
        () => assertMarshallerPreconditions(processPath),
        /manualtask32 \(0 fluxos de saida\)/
    );
});

test("preserva backup quando substitui um ECM30 diferente", t => {
    const root = temporaryDirectory(t);
    const target = path.join(root, "workflow", ".resources", "processo.ecm30.xml");
    const oldContent = Buffer.from(
        "<list><ProcessDefinition>old</ProcessDefinition><ProcessDefinitionVersion>1</ProcessDefinitionVersion></list>"
    );
    const newContent = Buffer.from(
        "<list><ProcessDefinition>new</ProcessDefinition><ProcessDefinitionVersion>1</ProcessDefinitionVersion></list>"
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, oldContent);

    const result = writeEcm30Artifact(target, newContent, new Date("2026-09-10T12:00:00Z"));
    assert.equal(fs.readFileSync(target, "utf8"), newContent.toString("utf8"));
    assert.ok(result.backupPath);
    assert.equal(fs.readFileSync(result.backupPath, "utf8"), oldContent.toString("utf8"));
});

test("orquestra Java, ponte e validacao sem gravar o .process", async t => {
    const root = temporaryDirectory(t);
    const pluginsDirectory = path.join(root, "plugins");
    const bridgeClassesDirectory = path.join(root, "bridge");
    const cacheDirectory = path.join(root, "cache");
    const processPath = path.join(root, "workflow", "diagrams", "processo.process");
    fakePlugins(pluginsDirectory);
    fs.mkdirSync(path.join(bridgeClassesDirectory, "com", "fluig", "bpm", "utils"), { recursive: true });
    fs.writeFileSync(path.join(bridgeClassesDirectory, "Ecm30Bridge.class"), "class");
    fs.writeFileSync(
        path.join(bridgeClassesDirectory, "com", "fluig", "bpm", "utils", "ProjectUtils.class"),
        "class"
    );
    fs.mkdirSync(path.dirname(processPath), { recursive: true });
    fs.writeFileSync(processPath, "<xmi:XMI></xmi:XMI>");

    const valid = "<list><ProcessDefinition></ProcessDefinition><ProcessDefinitionVersion></ProcessDefinitionVersion></list>";
    const calls = [];
    const fakeExec = async (_file, args) => {
        calls.push(args);
        if (args[0] === "-version") {
            return { stdout: "", stderr: 'openjdk version "17.0.12"' };
        }
        fs.writeFileSync(args[args.length - 2], valid);
        return { stdout: "generated", stderr: "" };
    };

    const result = await generateEcm30Artifact({
        processPath,
        pluginsDirectory,
        bridgeClassesDirectory,
        cacheDirectory,
        javaExecutable: "java",
        serverVersion: "1.8.2",
    }, {
        execFile: fakeExec,
        ensureXStreamJar: async () => path.join(root, "xstream.jar"),
    });

    assert.equal(result.content.toString("utf8"), valid);
    assert.equal(fs.readFileSync(processPath, "utf8"), "<xmi:XMI></xmi:XMI>");
    assert.equal(calls.length, 2);
    assert.match(calls[1][0], /^--add-opens=/);
});
