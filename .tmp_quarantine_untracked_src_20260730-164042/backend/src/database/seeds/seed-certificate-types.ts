import { DataSource } from 'typeorm';
import { CertificateType } from 'src/entities';

const certificateTypeSeeds: Array<{
  name: string;
  description: string;
  displayOrder: number;
}> = [
  {
    name: '在职证明',
    description: '证明员工当前在职状态',
    displayOrder: 10,
  },
  {
    name: '收入证明',
    description: '证明员工收入情况',
    displayOrder: 20,
  },
];

export async function seedCertificateTypes(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(CertificateType);

  for (const seed of certificateTypeSeeds) {
    const existed = await repository.findOne({ where: { name: seed.name } });
    if (existed) {
      continue;
    }

    await repository.save(
      repository.create({
        name: seed.name,
        description: seed.description,
        displayOrder: seed.displayOrder,
        isActive: true,
      }),
    );
  }
}
