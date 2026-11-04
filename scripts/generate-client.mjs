import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { config as dotenv } from 'dotenv';
const apiRoot = fileURLToPath(new URL('../apps/api/', import.meta.url));
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { getDMMF, getConfig } = require('@prisma/internals');
const { JsonRpcGenerator } = require('@prisma/internals/dist/Generator.js');
dotenv({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const schemaPath = `${apiRoot}prisma/schema.prisma`;
const datamodel = readFileSync(schemaPath, 'utf8');
const dmmf = await getDMMF({ datamodel });
const config = await getConfig({ datamodel });
if (config.generators[0].config.engineType !== 'client')
  throw new Error('Este projeto exige o runtime oficial engineType=client.');
const output = fileURLToPath(new URL('../node_modules/.prisma/client', import.meta.url));
const generatorConfig = {
  ...config.generators[0],
  output: { fromEnvVar: null, value: output },
  binaryTargets: [],
};
const generator = new JsonRpcGenerator(
  require.resolve('@prisma/client/generator-build/index.js'),
  generatorConfig,
  true,
);
try {
  await generator.init();
  generator.setOptions({
    generator: generatorConfig,
    otherGenerators: [],
    schemaPath,
    dmmf,
    datasources: config.datasources,
    datamodel,
    version: require('@prisma/engines-version').enginesVersion,
    binaryPaths: {},
    noEngine: false,
  });
  await generator.generate();
  console.log('Cliente Prisma PostgreSQL gerado com compilador WASM oficial (sem Rust).');
} finally {
  generator.stop();
}
