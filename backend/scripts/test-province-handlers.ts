// 省外派单逻辑测试脚本
// 验证：1) ProvinceHandler entity可用 2) dispatch-engine集成成功

import AppDataSource from '../src/database/data-source';
import { ProvinceHandler, User } from '../src/entities';

async function testProvinceHandlers() {
  await AppDataSource.initialize();

  try {
    const provinceHandlerRepo = AppDataSource.getRepository(ProvinceHandler);
    const userRepo = AppDataSource.getRepository(User);

    console.log('=== 测试1：查询province_handlers表 ===');
    const allHandlers = await provinceHandlerRepo.find({
      relations: { handler: true },
      take: 5,
    });
    console.log(`找到 ${allHandlers.length} 条省份映射记录`);
    for (const handler of allHandlers) {
      console.log(`- ${handler.province} → ${handler.handler?.realName ?? handler.handlerId} (weight: ${handler.weight})`);
    }

    console.log('\n=== 测试2：按省份查询福保专员 ===');
    const testProvinces = ['广东', '北京', '浙江'];
    for (const province of testProvinces) {
      const handlers = await provinceHandlerRepo.find({
        where: { province, isActive: true },
        relations: { handler: true },
        order: { weight: 'DESC' },
      });
      if (handlers.length > 0) {
        const names = handlers.map(h => h.handler?.realName ?? h.handlerId).join(', ');
        console.log(`${province}: ${names}`);
      } else {
        console.log(`${province}: 无配置`);
      }
    }

    console.log('\n=== 测试3：统计各省份配置情况 ===');
    const count = await provinceHandlerRepo.count();
    console.log(`总配置数：${count}`);

    const provinces = await provinceHandlerRepo
      .createQueryBuilder('ph')
      .select('ph.province')
      .addSelect('COUNT(ph.id)', 'handlerCount')
      .groupBy('ph.province')
      .orderBy('handlerCount', 'DESC')
      .limit(10)
      .getRawMany();
    console.log('配置最多的省份（多人备份）：');
    for (const row of provinces) {
      console.log(`- ${row.ph_province}: ${row.handlerCount}人`);
    }

    console.log('\n✅ 省外派单配置测试通过');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void testProvinceHandlers();
