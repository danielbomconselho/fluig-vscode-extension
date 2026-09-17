# Runtime autocontido do gerador ECM30

Esta pasta e preenchida no build de distribuicao por
`scripts/prepare-bundled-runtime.js`.

O VSIX recebe:

- um JRE Eclipse Temurin privado em `runtime/java/<plataforma-arquitetura>`;
- somente os JARs usados pelo conversor do Fluig Studio em
  `runtime/fluig-studio/plugins`.

O Java nao e instalado globalmente e nao altera `PATH` ou `JAVA_HOME`.

Os JARs TOTVS sao copiados de uma instalacao local do Fluig Studio. Confirme
que a licenca contratada permite redistribui-los antes de compartilhar o VSIX.
