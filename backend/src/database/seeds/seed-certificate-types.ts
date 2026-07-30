import { DataSource } from 'typeorm';
import { CertificateType } from 'src/entities';

const certificateTypeSeeds: Array<{
  name: string;
  description: string;
  templateUrl: string | null;
  isActive: boolean;
}> = [
  {
    name: '在职证明',
    description: '证明员工当前在职状态',
    templateUrl: '/assets/certificates/employment-certificate.docx',
    isActive: true,
  },
  {
    name: '收入证明',
    description: '证明员工收入情况',
    templateUrl: '/assets/certificates/income-certificate.docx',
    isActive: true,
  },
  {
    name: '离职证明',
    description: '证明员工已离职',
    templateUrl: null,
    isActive: true,
  },
  {
    name: '工作经历证明',
    description: '证明员工工作经历',
    templateUrl: null,
    isActive: true,
  },
  {
    name: '实习证明',
    description: '证明实习经历',
    templateUrl: null,
    isActive: true,
  },
  {
    name: '其他证明',
    description: '其他类型证明',
    templateUrl: null,
    isActive: true,
  },
];

export async function seedCertificateTypes(dataSource: DataSource): Promise<void> {
  // 检查表是否存在，不存在则创建
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const tableExists = await queryRunner.hasTable('certificate_types');

    if (!tableExists) {
      await queryRunner.query(`
        CREATE TABLE certificate_types (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL UNIQUE,
          description TEXT,
          template_url VARCHAR(500),
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      console.log('✓ 表 certificate_types 已创建');
    } else {
      // 表存在，检查列是否正确
      const hasTemplateUrl = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'certificate_types'
          AND column_name = 'template_url'
      `);

      if (!hasTemplateUrl || hasTemplateUrl.length === 0) {
        // 列不存在，删除表重建
        await queryRunner.query(`DROP TABLE IF EXISTS certificate_types CASCADE`);
        await queryRunner.query(`
          CREATE TABLE certificate_types (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            template_url VARCHAR(500),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        console.log('✓ 表 certificate_types 已重建（修复列名）');
      }
    }
  } finally {
    await queryRunner.release();
  }

  const certificateTypeRepo = dataSource.getRepository(CertificateType);

  for (const seed of certificateTypeSeeds) {
    const existing = await certificateTypeRepo.findOne({ where: { name: seed.name } });
    if (!existing) {
      const certificateType = certificateTypeRepo.create(seed);
      await certificateTypeRepo.save(certificateType);
      console.log(`✓ 证明类型已创建: ${seed.name}`);
    } else {
      console.log(`- 证明类型已存在: ${seed.name}`);
    }
  }
}
