import { DataSource } from 'typeorm';
import { ImportTemplateConfigService } from './src/modules/imports/import-template-config.service';
import { FieldConfig, ImportTemplateField, OrderType } from './src/entities';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 5433,
    username: 'postgres',
    password: 'postgres',
    database: 'ticket_system',
    entities: ['src/entities/**/*.ts'],
  });

  await ds.initialize();
  
  const fieldRepo = ds.getRepository(FieldConfig);
  const templateRepo = ds.getRepository(ImportTemplateField);
  const service = new ImportTemplateConfigService(fieldRepo, templateRepo);
  
  const fields = await service.list(OrderType.ONBOARDING);
  
  console.log('实际生成模板时的字段列表（前20个）：\n');
  const CUSTOMER_REQUIRED = new Set([
    'customer_name', 'employee_name', 'id_card_type', 'id_card_no', 'mobile',
    'position', 'contract_start_date', 'work_city', 'base_salary', 'social_location',
    'bank_account', 'bank_name'
  ]);
  
  fields.slice(0, 20).forEach((f, i) => {
    const shouldHighlight = CUSTOMER_REQUIRED.has(f.fieldCode);
    console.log(`${i+1}. ${f.fieldCode.padEnd(25)} ${f.fieldName.padEnd(15)} ${shouldHighlight ? '[应标黄]' : ''}`);
  });
  
  console.log(`\n总字段数: ${fields.length}`);
  console.log(`应标黄字段数: ${fields.filter(f => CUSTOMER_REQUIRED.has(f.fieldCode)).length}`);
  
  await ds.destroy();
}

main().catch(console.error);
