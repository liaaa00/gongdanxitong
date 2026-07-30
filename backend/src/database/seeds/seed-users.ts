import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Department, Role, User, UserRole } from 'src/entities';

interface UserRoleSeed {
  roleCode: string;
  departmentCode: string;
  isPrimary?: boolean;
}

interface UserSeed {
  username: string;
  realName: string;
  email: string;
  phone: string;
  roles: UserRoleSeed[];
}

const defaultPassword = '123456';

const userSeeds: UserSeed[] = [
  { username: 'lizhanbo', realName: '李占博', email: 'lizhanbo@example.com', phone: '13800000001', roles: [{ roleCode: 'admin', departmentCode: 'SYSTEM_ADMIN', isPrimary: true }] },
  { username: 'wangzixi', realName: '王梓曦', email: 'wangzixi@example.com', phone: '13800000002', roles: [{ roleCode: 'admin', departmentCode: 'SYSTEM_ADMIN', isPrimary: true }] },
  {
    username: 'aolei',
    realName: '敖蕾',
    email: 'aolei@example.com',
    phone: '13800000003',
    roles: [
      { roleCode: 'biz_manager', departmentCode: 'BUSINESS', isPrimary: true },
    ],
  },
  {
    username: 'xuekun',
    realName: '薛锟',
    email: 'xuekun@example.com',
    phone: '13800000004',
    roles: [
      { roleCode: 'biz_manager', departmentCode: 'BUSINESS', isPrimary: true },
    ],
  },
  {
    username: 'yuqinxia',
    realName: '余琴霞',
    email: 'yuqinxia@example.com',
    phone: '13800000005',
    roles: [
      { roleCode: 'biz_manager', departmentCode: 'BUSINESS', isPrimary: true },
    ],
  },
  {
    username: 'shenwenjun',
    realName: '沈文君',
    email: 'shenwenjun@example.com',
    phone: '13800000006',
    roles: [
      { roleCode: 'biz_leader', departmentCode: 'BUSINESS_GROUP_1', isPrimary: true },
    ],
  },
  { username: 'yaoyiping', realName: '姚怡萍', email: 'yaoyiping@example.com', phone: '13800000007', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_1', isPrimary: true }] },
  { username: 'yanqiuyue', realName: '闫秋月', email: 'yanqiuyue@example.com', phone: '13800000008', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_1', isPrimary: true }] },
  { username: 'chengyu', realName: '程裕', email: 'chengyu@example.com', phone: '13800000009', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_1', isPrimary: true }] },
  {
    username: 'chenyuchen',
    realName: '陈雨辰',
    email: 'chenyuchen@example.com',
    phone: '13800000010',
    roles: [
      { roleCode: 'biz_leader', departmentCode: 'BUSINESS_GROUP_2', isPrimary: true },
    ],
  },
  { username: 'zhouqiqing', realName: '周琪晴', email: 'zhouqiqing@example.com', phone: '13800000011', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_2', isPrimary: true }] },
  { username: 'wuyufei', realName: '吴雨菲', email: 'wuyufei@example.com', phone: '13800000012', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_2', isPrimary: true }] },
  {
    username: 'gaolulu',
    realName: '高璐璐',
    email: 'gaolulu@example.com',
    phone: '13800000013',
    roles: [
      { roleCode: 'biz_leader', departmentCode: 'BUSINESS_GROUP_3', isPrimary: true },
    ],
  },
  { username: 'zhaotianqi', realName: '赵天琪', email: 'zhaotianqi@example.com', phone: '13800000014', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_3', isPrimary: true }] },
  {
    username: 'liucheng',
    realName: '刘程',
    email: 'liucheng@example.com',
    phone: '13800000015',
    roles: [
      { roleCode: 'biz_leader', departmentCode: 'BUSINESS_GROUP_4', isPrimary: true },
    ],
  },
  { username: 'xujing', realName: '许靖', email: 'xujing@example.com', phone: '13800000016', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_4', isPrimary: true }] },
  { username: 'taomingyue', realName: '陶明月', email: 'taomingyue@example.com', phone: '13800000017', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_4', isPrimary: true }] },
  { username: 'xujiayin', realName: '徐嘉胤', email: 'xujiayin@example.com', phone: '13800000018', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_4', isPrimary: true }] },
  {
    username: 'yuweiwei',
    realName: '余维维',
    email: 'yuweiwei@example.com',
    phone: '13800000019',
    roles: [
      { roleCode: 'biz_leader', departmentCode: 'BUSINESS_GROUP_5', isPrimary: true },
    ],
  },
  { username: 'zhangpuwei', realName: '张埔微', email: 'zhangpuwei@example.com', phone: '13800000020', roles: [{ roleCode: 'biz_member', departmentCode: 'BUSINESS_GROUP_5', isPrimary: true }] },
  {
    username: 'annazhen',
    realName: '安娜祯',
    email: 'annazhen@example.com',
    phone: '13800000021',
    roles: [
      { roleCode: 'data_entry_leader', departmentCode: 'DATA_ENTRY_GROUP', isPrimary: true },
    ],
  },
  {
    username: 'jianglu',
    realName: '江璐',
    email: 'jianglu@example.com',
    phone: '13800000022',
    roles: [
      { roleCode: 'shared_leader', departmentCode: 'SHARED_TEAM', isPrimary: true },
      { roleCode: 'contract_specialist', departmentCode: 'SHARED_CONTRACT' },
      { roleCode: 'onboarding_specialist', departmentCode: 'SHARED_ONBOARDING_RESIGNATION' },
    ],
  },
  {
    username: 'yangchun',
    realName: '杨纯',
    email: 'yangchun@example.com',
    phone: '13800000023',
    roles: [
      { roleCode: 'contract_specialist', departmentCode: 'SHARED_CONTRACT', isPrimary: true },
    ],
  },
  {
    username: 'maoyani',
    realName: '毛雅妮',
    email: 'maoyani@example.com',
    phone: '13800000024',
    roles: [
      { roleCode: 'onboarding_specialist', departmentCode: 'SHARED_ONBOARDING_RESIGNATION', isPrimary: true },
    ],
  },
  {
    username: 'fuqianwen',
    realName: '傅倩雯',
    email: 'fuqianwen@example.com',
    phone: '13800000025',
    roles: [
      { roleCode: 'social_insurance_specialist', departmentCode: 'WELFARE_SECURITY', isPrimary: true },
    ],
  },

  // Backward-compatible demo/service accounts kept active but not counted as the real org.
  { username: 'admin', realName: '系统管理员（兼容账号）', email: 'admin@example.com', phone: '13800000901', roles: [{ roleCode: 'admin', departmentCode: 'SYSTEM_ADMIN', isPrimary: true }] },
  { username: 'contractsup01', realName: '合同主管（兼容账号）', email: 'contractsup01@example.com', phone: '13800000902', roles: [{ roleCode: 'shared_leader', departmentCode: 'SHARED_TEAM', isPrimary: true }, { roleCode: 'contract_specialist', departmentCode: 'SHARED_CONTRACT' }] },
  { username: 'onboardsup01', realName: '入职联系主管（兼容账号）', email: 'onboardsup01@example.com', phone: '13800000903', roles: [{ roleCode: 'shared_leader', departmentCode: 'SHARED_TEAM', isPrimary: true }, { roleCode: 'onboarding_specialist', departmentCode: 'SHARED_ONBOARDING_RESIGNATION' }] },
  { username: 'dataentrysup01', realName: '数据录入主管（兼容账号）', email: 'dataentrysup01@example.com', phone: '13800000904', roles: [{ roleCode: 'data_entry_leader', departmentCode: 'DATA_ENTRY_GROUP', isPrimary: true }] },
  { username: 'socialsup01', realName: '社保主管（兼容账号）', email: 'socialsup01@example.com', phone: '13800000905', roles: [{ roleCode: 'shared_leader', departmentCode: 'SHARED_TEAM', isPrimary: true }] },
  { username: 'social01', realName: '社保专员（兼容账号）', email: 'social01@example.com', phone: '13800000906', roles: [{ roleCode: 'data_entry_leader', departmentCode: 'DATA_ENTRY_GROUP', isPrimary: true }] },
];

export async function seedUsers(dataSource: DataSource): Promise<void> {
  await dataSource.query('SELECT pg_advisory_lock(hashtext($1))', ['seedUsers']);
  try {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);
  const departmentRepository = dataSource.getRepository(Department);
  const userRoleRepository = dataSource.getRepository(UserRole);

  const hashed = await bcrypt.hash(defaultPassword, 10);

  for (const seed of userSeeds) {
    let user = await userRepository.findOne({ where: { username: seed.username } });
    if (!user) {
      user = await userRepository.findOne({ where: { email: seed.email } });
    }
    if (!user) {
      user = await userRepository.save(userRepository.create({
        username: seed.username,
        realName: seed.realName,
        email: seed.email,
        phone: seed.phone,
        passwordHash: hashed,
        avatarUrl: null,
        isActive: true,
        mustChangePassword: true,
        passwordUpdatedAt: null,
      }));
    }

    for (const relation of seed.roles) {
      const role = await roleRepository.findOne({ where: { code: relation.roleCode } });
      const department = await departmentRepository.findOne({ where: { code: relation.departmentCode } });

      if (!role || !department) {
        throw new Error(`Seed relation target missing: ${seed.username} -> ${relation.roleCode}/${relation.departmentCode}`);
      }

      const existedRelation = await userRoleRepository.findOne({
        where: { userId: user.id, roleId: role.id, departmentId: department.id },
      });
      if (existedRelation) continue;

      await userRoleRepository.save(userRoleRepository.create({
        userId: user.id,
        roleId: role.id,
        departmentId: department.id,
        isPrimary: relation.isPrimary === true,
      }));
    }
  }
  } finally {
    await dataSource.query('SELECT pg_advisory_unlock(hashtext($1))', ['seedUsers']).catch(() => undefined);
  }
}
