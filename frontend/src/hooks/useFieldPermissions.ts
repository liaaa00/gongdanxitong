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

    const roleIds = user.roles?.map((r) => r.id) || [];
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
