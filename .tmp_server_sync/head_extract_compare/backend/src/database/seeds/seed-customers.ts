import { DataSource } from 'typeorm';
import { Customer } from 'src/entities';

const customerSeeds: Array<{ code: string; name: string }> = [
  { code: 'CUST_NB001', name: '宁波某制造集团' },
  { code: 'CUST_HZ002', name: '杭州某科技公司' },
  { code: 'CUST_WZ003', name: '温州某服务外包企业' },
];

export async function seedCustomers(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(Customer);

  for (const seed of customerSeeds) {
    const existed = await repository.findOne({
      where: { customerCode: seed.code },
    });

    if (existed) {
      continue;
    }

    await repository.save(
      repository.create({
        customerCode: seed.code,
        customerName: seed.name,
        isActive: true,
      }),
    );
  }
}
