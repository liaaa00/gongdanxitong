process.chdir(__dirname + '/backend');
require('./node_modules/reflect-metadata');
const { NestFactory } = require('./node_modules/@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { ImportTemplateService } = require('./dist/modules/imports/import-template.service');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const svc = app.get(ImportTemplateService);
  const result = await svc.generate('onboarding');
  const fs = require('fs');
  fs.writeFileSync(__dirname + '/.tmp_local_onboarding_template.xlsx', result.buffer);
  console.log(JSON.stringify({ fieldCount: result.fieldCount, fileName: result.fileName }));
  await app.close();
}
main().catch(err => { console.error(err); process.exit(1); });
