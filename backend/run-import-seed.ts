import { DataSource } from 'typeorm';
import { seedImportTemplateFields } from './src/database/seeds/seed-import-template-fields';

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
  console.log('数据库连接成功');
  
  await seedImportTemplateFields(ds);
  console.log('✓ 导入模板字段配置完成');
  
  await ds.destroy();
}

main().catch(console.error);
