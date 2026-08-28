import type { UserItem } from '@/services/users';

const DATA_ENTRY_HANDLER_ROLES = [
  'data_entry_leader',
  'data_entry_team',
  'data_entry_supervisor',
  'data_entry_specialist',
] as const;

const CONTRACT_HANDLER_ROLES = [
  'contract_specialist',
  'labor_contract_member',
  'contract_team',
] as const;

const ONBOARDING_CONTACT_HANDLER_ROLES = [
  'onboarding_specialist',
  'onboarding_resignation_member',
  'onboarding_team',
  'contract_team',
] as const;

const SOCIAL_INSURANCE_HANDLER_ROLES = [
  'social_insurance_specialist',
  'social_insurance_team',
  'social_insurance_supervisor',
  'social_security_supervisor',
] as const;

const IN_SERVICE_CERTIFICATE_HANDLER_ROLES = [
  'shared_leader',
  'shared_team_owner',
  'labor_contract_member',
  'onboarding_resignation_member',
] as const;

const MODULE_HANDLER_ROLES: Record<string, readonly string[]> = {
  contract: CONTRACT_HANDLER_ROLES,
  contract_signing: CONTRACT_HANDLER_ROLES,
  renewal_contract: CONTRACT_HANDLER_ROLES,
  onboarding_contact: ONBOARDING_CONTACT_HANDLER_ROLES,
  resignation_contact: ONBOARDING_CONTACT_HANDLER_ROLES,
  in_service_certificate: IN_SERVICE_CERTIFICATE_HANDLER_ROLES,
  data_entry: DATA_ENTRY_HANDLER_ROLES,
  data_entry_resign: DATA_ENTRY_HANDLER_ROLES,
  social_insurance: SOCIAL_INSURANCE_HANDLER_ROLES,
  social_insurance_change: SOCIAL_INSURANCE_HANDLER_ROLES,
  social_insurance_resign: SOCIAL_INSURANCE_HANDLER_ROLES,
  resignation_social_insurance: SOCIAL_INSURANCE_HANDLER_ROLES,
  benefit: ['shared_leader', 'shared_team_owner'],
  benefit_apply: ['shared_leader', 'shared_team_owner'],
};

export function getRequiredHandlerRoles(moduleCode?: string | null): readonly string[] {
  return MODULE_HANDLER_ROLES[String(moduleCode || '').trim()] || [];
}

export function getModuleHandlerRoleCodes(user: Pick<UserItem, 'roles'> | null | undefined): string[] {
  return (user?.roles || [])
    .map((role) => role.role_code || '')
    .map((role) => role.trim())
    .filter(Boolean);
}

export function getMissingHandlerRoles(moduleCode: string | null | undefined, roleCodes: readonly string[]): string[] {
  const required = getRequiredHandlerRoles(moduleCode);
  if (roleCodes.includes('admin')) return [];
  return required.filter((role) => !roleCodes.includes(role));
}

export function isEligibleModuleHandlerRoles(moduleCode: string | null | undefined, roleCodes: readonly string[]): boolean {
  const required = getRequiredHandlerRoles(moduleCode);
  return roleCodes.includes('admin') || required.length === 0 || required.some((role) => roleCodes.includes(role));
}

export function isEligibleModuleHandler(moduleCode: string | null | undefined, user: Pick<UserItem, 'roles'> | null | undefined): boolean {
  return isEligibleModuleHandlerRoles(moduleCode, getModuleHandlerRoleCodes(user));
}
