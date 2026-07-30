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
