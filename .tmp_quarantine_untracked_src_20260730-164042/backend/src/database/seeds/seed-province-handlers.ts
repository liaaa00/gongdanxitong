import { DataSource } from 'typeorm';
import { ProvinceHandler, User } from 'src/entities';

// 省份→福保专员映射（来源：在职模块配置表 Sheet "省份-福保专员映射关系（单项业务）"）
// 多人用斜杠分隔的，按权重分配：第一人weight=10，后续人weight=5
const provinceHandlerSeeds: Array<{
  province: string;
  specialists: Array<{ realName: string; weight: number }>;
}> = [
  { province: '广东', specialists: [{ realName: '陈丽', weight: 10 }] },
  { province: '安徽', specialists: [{ realName: '陈丽', weight: 10 }] },
  { province: '黑龙江', specialists: [{ realName: '杨易', weight: 10 }] },
  { province: '重庆', specialists: [{ realName: '戴俊祥', weight: 10 }] },
  { province: '湖北', specialists: [{ realName: '朱敏', weight: 10 }, { realName: '戴敏华', weight: 5 }] },
  { province: '江西', specialists: [{ realName: '方志英', weight: 10 }] },
  { province: '云南', specialists: [{ realName: '方志英', weight: 10 }] },
  { province: '吉林', specialists: [{ realName: '方志英', weight: 10 }] },
  { province: '江苏', specialists: [{ realName: '何晓丽', weight: 10 }, { realName: '戴俊祥', weight: 5 }] },
  { province: '山西', specialists: [{ realName: '钱卓贇', weight: 10 }, { realName: '何依恬', weight: 5 }] },
  { province: '山东', specialists: [{ realName: '余正', weight: 10 }, { realName: '何依恬', weight: 5 }] },
  { province: '北京', specialists: [{ realName: '徐晓芬', weight: 10 }] },
  { province: '陕西', specialists: [{ realName: '徐晓芬', weight: 10 }] },
  { province: '辽宁', specialists: [{ realName: '徐晓芬', weight: 10 }] },
  { province: '天津', specialists: [{ realName: '羊晓焓', weight: 10 }] },
  { province: '福建', specialists: [{ realName: '羊晓焓', weight: 10 }, { realName: '杨杰', weight: 5 }] },
  { province: '上海', specialists: [{ realName: '杨杰', weight: 10 }] },
  { province: '湖南', specialists: [{ realName: '杨杰', weight: 10 }] },
  { province: '河南', specialists: [{ realName: '杨杰', weight: 10 }] },
  { province: '河北', specialists: [{ realName: '杨易', weight: 10 }] },
  { province: '贵州', specialists: [{ realName: '杨易', weight: 10 }] },
  { province: '四川', specialists: [{ realName: '朱敏', weight: 10 }] },
  { province: '广西', specialists: [{ realName: '朱敏', weight: 10 }] },
  { province: '甘肃', specialists: [{ realName: '方志英', weight: 10 }] },
  { province: '新疆', specialists: [{ realName: '何依恬', weight: 10 }] },
  { province: '宁夏', specialists: [{ realName: '杨杰', weight: 10 }] },
  { province: '海南', specialists: [{ realName: '朱敏', weight: 10 }] },
];

export async function seedProvinceHandlers(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const provinceHandlerRepo = dataSource.getRepository(ProvinceHandler);

  for (const seed of provinceHandlerSeeds) {
    for (const specialist of seed.specialists) {
      // 按realName查找用户（福保专员账号可能还未创建，缺失时不阻断seed）
      const user = await userRepo.findOne({ where: { realName: specialist.realName } });
      if (!user) {
        console.log(`[省外配置] 福保专员 ${specialist.realName} 账号未找到，跳过省份 ${seed.province}`);
        continue;
      }

      const existed = await provinceHandlerRepo.findOne({
        where: { province: seed.province, handlerId: user.id },
      });
      if (existed) continue;

      await provinceHandlerRepo.save(
        provinceHandlerRepo.create({
          province: seed.province,
          handlerId: user.id,
          weight: specialist.weight,
          isActive: true,
        }),
      );
    }
  }
}
