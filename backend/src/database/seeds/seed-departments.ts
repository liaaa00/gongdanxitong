import { DataSource } from 'typeorm';
import { Department } from 'src/entities';

const departmentSeeds: Array<{
  code: string;
  name: string;
  sortOrder: number;
  parentCode: string | null;
}> = [
  { code: 'SYSTEM_ADMIN', name: '系统管理', sortOrder: 1, parentCode: null },
  { code: 'BUSINESS', name: '业务团队', sortOrder: 2, parentCode: null },
  { code: 'BUSINESS_GROUP_1', name: '业务1组', sortOrder: 21, parentCode: 'BUSINESS' },
  { code: 'BUSINESS_GROUP_2', name: '业务2组', sortOrder: 22, parentCode: 'BUSINESS' },
  { code: 'BUSINESS_GROUP_3', name: '业务3组', sortOrder: 23, parentCode: 'BUSINESS' },
  { code: 'BUSINESS_GROUP_4', name: '业务4组', sortOrder: 24, parentCode: 'BUSINESS' },
  { code: 'BUSINESS_GROUP_5', name: '业务5组', sortOrder: 25, parentCode: 'BUSINESS' },
  { code: 'DATA_ENTRY_GROUP', name: '数据录入组', sortOrder: 3, parentCode: 'BUSINESS' },
  { code: 'SHARED_TEAM', name: '共享团队', sortOrder: 4, parentCode: null },
  { code: 'SHARED_CONTRACT', name: '合同签订组', sortOrder: 41, parentCode: 'SHARED_TEAM' },
  { code: 'SHARED_ONBOARDING_RESIGNATION', name: '入离职联系组', sortOrder: 42, parentCode: 'SHARED_TEAM' },
  { code: 'WELFARE_SECURITY', name: '福利保障部', sortOrder: 5, parentCode: null },

  // Backward-compatible departments kept active for historical data and older API consumers.
  { code: 'BIZ', name: '业务团队（兼容）', sortOrder: 90, parentCode: 'BUSINESS' },
  { code: 'CONTRACT_CENTER', name: '合同中心（兼容）', sortOrder: 91, parentCode: 'SHARED_CONTRACT' },
  { code: 'SHARED_SERVICE', name: '共享服务中心（兼容）', sortOrder: 92, parentCode: 'SHARED_TEAM' },
  { code: 'DATA_ENTRY_CENTER', name: '集约岗（兼容）', sortOrder: 93, parentCode: 'DATA_ENTRY_GROUP' },
  { code: 'SOCIAL_TEAM', name: '社保团队（兼容）', sortOrder: 94, parentCode: 'SHARED_TEAM' },
];

export async function seedDepartments(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(Department);
  const byCode = new Map<string, Department>();

  for (const departmentSeed of departmentSeeds) {
    let department = await repository.findOne({ where: { code: departmentSeed.code } });

    if (!department) {
      department = repository.create({
        code: departmentSeed.code,
        name: departmentSeed.name,
        sortOrder: departmentSeed.sortOrder,
        isActive: true,
        parentId: null,
      });
    } else {
      department.name = departmentSeed.name;
      department.sortOrder = departmentSeed.sortOrder;
      department.isActive = true;
      department.parentId = null;
    }

    const saved = await repository.save(department);
    byCode.set(saved.code, saved);
  }

  for (const departmentSeed of departmentSeeds) {
    if (!departmentSeed.parentCode) continue;
    const department = byCode.get(departmentSeed.code);
    const parent = byCode.get(departmentSeed.parentCode);
    if (!department || !parent || department.parentId === parent.id) continue;
    department.parentId = parent.id;
    await repository.save(department);
  }
}
