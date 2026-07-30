import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '@/stores/userStore';
import { getFieldPermissions } from '@/services/fieldPermissions';
import type { FieldPermission } from '@/components/DynamicForm';

const cacheMap = new Map<string, Record<string, FieldPermission>>();

export function useFieldPermissions(scenario: string) {
  const { user } = useUserStore();
  const [permissions, setPermissions] = useState<Record<string, FieldPermission>>({});
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!user || !scenario) return;

    const roleCodes = user.roles?.map((r) => r.code) || [];
    if (roleCodes.includes('admin')) {
      // DynamicForm 对未配置权限的字段默认 visible；admin 不应因旧权限矩阵缺项而隐藏条件字段。
      setPermissions({});
      return;
    }

    const rawRoles = user.roles || [];
    const roleIds = rawRoles
      .map((role) => String(role.id || ''))
      .filter((id, index): id is string => {
        const code = String(rawRoles[index]?.code || '');
        return Boolean(id) && id !== code;
      });
    if (roleIds.length === 0) {
      // 当前登录态有时只携带角色 code（如 biz_member）而不是可查询的角色 id。
      // 此时不要请求仅管理员可用的字段权限配置接口，DynamicForm 默认按 visible 渲染。
      setPermissions({});
      return;
    }
    const cacheKey = `${roleIds.join(',')}::${scenario}`;

    if (cacheMap.has(cacheKey)) {
      setPermissions(cacheMap.get(cacheKey)!);
      return;
    }

    if (fetchedRef.current) return;
    fetchedRef.current = true;

    setLoading(true);
    Promise.all(
      roleIds.map((roleId) => getFieldPermissions({ role_id: roleId, scenario })),
    )
      .then((results) => {
        const merged: Record<string, FieldPermission> = {};
        for (const perms of results.flat()) {
          const current = merged[perms.field_code];
          if (!current || current === 'hidden') {
            merged[perms.field_code] = perms.permission;
          } else if (perms.permission === 'visible') {
            merged[perms.field_code] = 'visible';
          } else if (perms.permission === 'readonly' && current !== 'visible') {
            merged[perms.field_code] = 'readonly';
          } else if (perms.permission === 'masked' && current !== 'visible' && current !== 'readonly') {
            merged[perms.field_code] = 'masked';
          }
        }
        cacheMap.set(cacheKey, merged);
        setPermissions(merged);
      })
      .finally(() => setLoading(false));
  }, [user, scenario]);

  return { permissions, loading };
}
