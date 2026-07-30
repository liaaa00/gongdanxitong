// 独立运行province_handlers seed（不依赖完整seed流程）
import AppDataSource from '../src/database/data-source';
import { seedProvinceHandlers } from '../src/database/seeds/seed-province-handlers';

async function runProvinceSeed() {
  console.log('===开始province_handlers seed===\n');

  await AppDataSource.initialize();

  try {
    await seedProvinceHandlers(AppDataSource);
    console.log('\n✅ province_handlers seed完成');

    // 验证写入
    const result = await AppDataSource.query(
      'SELECT province, COUNT(*) as count FROM province_handlers GROUP BY province ORDER BY province'
    );
    console.log(`\n写入统计: ${result.length}个省份`);
    console.log('\n前10个省份:');
    result.slice(0, 10).forEach((row: any) => {
      console.log(`- ${row.province}: ${row.count}人`);
    });

  } catch (error) {
    console.error('\n❌ Seed失败:', error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void runProvinceSeed();
