import { expect, test } from '@playwright/test';
import { loginAs, mockCommonApis } from './_helpers';

const USERS = [
  { username: 'lizhanbo', role: 'admin', visible: ['管理后台', '用户管理', '仪表盘'], hidden: ['入职导入', '离职导入'] },
  { username: 'aolei', role: 'business_owner', visible: ['仪表盘', '入职管理', '在职管理', '离职管理'], hidden: ['管理后台', '消息通知', '我的工单', '团队工单', '历史工单', '入职导入', '离职导入'] },
  { username: 'jianglu', role: 'shared_team_owner', visible: ['入职管理', '在职管理', '离职管理', '劳动合同新签子工单', '入职联系子工单', '离职材料收集子工单'], hidden: ['入职导入', '离职导入', '社保公积金增员子工单'] },
  { username: 'yangchun', role: 'labor_contract_member', visible: ['劳动合同新签子工单'], hidden: ['入职联系子工单', '离职材料收集子工单', '管理后台', '入职导入'] },
  { username: 'maoyani', role: 'onboarding_resignation_member', visible: ['入职联系子工单', '离职材料收集子工单'], hidden: ['劳动合同新签子工单', '管理后台'] },
  { username: 'annazhen', role: 'data_entry_leader', visible: ['增员报岗录入子工单', '减员报岗录入子工单'], hidden: ['劳动合同新签子工单', '离职材料收集子工单', '管理后台'] },
];

test.describe('role menu visibility smoke', () => {
  for (const user of USERS) {
    test(`${user.username} menu`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mockCommonApis(page, user.role);
      await loginAs(page, user.username, user.role);
      await page.goto('/dashboard');
      const menuEntry = (name: string) => page.locator(`[data-menu-name="${name}"], .ant-menu-submenu-title`).filter({ hasText: name });
      await expect(menuEntry('仪表盘')).toBeVisible({ timeout: 10000 });

      const expandRoots = new Set<string>();
      if (user.visible.some((text) => ['团队工单', '历史工单'].includes(text))) expandRoots.add('我的工单');
      if (user.visible.some((text) => ['用户管理'].includes(text))) {
        expandRoots.add('管理后台');
        expandRoots.add('基础配置');
      }
      if (user.visible.some((text) => ['劳动合同新签子工单', '增员报岗录入子工单', '入职联系子工单'].includes(text))) expandRoots.add('入职管理');
      if (user.visible.some((text) => ['离职材料收集子工单', '减员报岗录入子工单'].includes(text))) expandRoots.add('离职管理');

      for (const root of expandRoots) {
        const button = page.locator('.ant-menu-submenu-title').filter({ hasText: root });
        if (await button.count()) {
          await button.first().click();
        }
      }

      for (const text of user.visible) {
        await expect(menuEntry(text)).toHaveCount(1);
      }
      for (const text of user.hidden) {
        await expect(menuEntry(text)).toHaveCount(0);
      }
    });
  }
});
