import { describe, it, expect } from 'vitest';
import { canAccessPath } from '../src/config/routeVisibility';

describe('业务负责人(business_owner)权限测试', () => {
  // 模拟后端返回新角色代码 biz_manager
  const businessOwnerRoles = [{ code: 'biz_manager' }];

  describe('应该能访问的路由', () => {
    it('应该能访问主工单列表 /work-orders', () => {
      const canAccess = canAccessPath('/work-orders', businessOwnerRoles);
      expect(canAccess).toBe(true);
    });

    it('应该能访问主工单详情 /work-orders/:id', () => {
      const canAccess = canAccessPath('/work-orders/123', businessOwnerRoles);
      expect(canAccess).toBe(true);
    });

    it('应该能访问仪表盘 /dashboard', () => {
      const canAccess = canAccessPath('/dashboard', businessOwnerRoles);
      expect(canAccess).toBe(true);
    });

    it('应该能访问领导看板 /dashboards/leader', () => {
      const canAccess = canAccessPath('/dashboards/leader', businessOwnerRoles);
      expect(canAccess).toBe(true);
    });

    it('应该能访问在职管理 /in-service', () => {
      const canAccess = canAccessPath('/in-service', businessOwnerRoles);
      expect(canAccess).toBe(true);
    });

    it('应该能访问省外业务 /out-of-province', () => {
      const canAccess = canAccessPath('/out-of-province', businessOwnerRoles);
      expect(canAccess).toBe(true);
    });
  });

  describe('不应该能访问的路由', () => {
    it('不应该能访问系统管理 /admin', () => {
      const canAccess = canAccessPath('/admin', businessOwnerRoles);
      expect(canAccess).toBe(false);
    });

    it('不应该能访问用户管理 /admin/users', () => {
      const canAccess = canAccessPath('/admin/users', businessOwnerRoles);
      expect(canAccess).toBe(false);
    });

    it('不应该能访问入职管理入口 /onboarding', () => {
      const canAccess = canAccessPath('/onboarding', businessOwnerRoles);
      expect(canAccess).toBe(false);
    });
  });

  describe('角色代码归一化测试', () => {
    it('新角色代码 biz_manager 应该正确归一化', () => {
      const rolesWithNewCode = [{ code: 'biz_manager' }];
      const canAccess = canAccessPath('/work-orders', rolesWithNewCode);
      expect(canAccess).toBe(true);
    });

    it('旧角色代码 business_owner 应该正确归一化', () => {
      const rolesWithOldCode = [{ code: 'business_owner' }];
      const canAccess = canAccessPath('/work-orders', rolesWithOldCode);
      expect(canAccess).toBe(true);
    });

    it('新旧代码应该有相同的权限效果', () => {
      const newCode = [{ code: 'biz_manager' }];
      const oldCode = [{ code: 'business_owner' }];

      const testRoutes = [
        '/work-orders',
        '/dashboard',
        '/dashboards/leader',
        '/in-service',
        '/out-of-province'
      ];

      testRoutes.forEach(route => {
        const canAccessNew = canAccessPath(route, newCode);
        const canAccessOld = canAccessPath(route, oldCode);
        expect(canAccessNew).toBe(canAccessOld);
      });
    });
  });
});
