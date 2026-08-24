import { describe, expect, it } from 'vitest';
import {
  getMissingHandlerRoles,
  isEligibleModuleHandler,
  isEligibleModuleHandlerRoles,
} from './moduleHandlerEligibility';

describe('module handler eligibility', () => {
  it('requires data-entry roles for the resignation data-entry module', () => {
    expect(isEligibleModuleHandlerRoles('data_entry_resign', ['data_entry_leader'])).toBe(true);
    expect(isEligibleModuleHandlerRoles('data_entry_resign', ['shared_leader'])).toBe(false);
    expect(getMissingHandlerRoles('data_entry_resign', ['shared_leader'])).toEqual([
      'data_entry_leader',
      'data_entry_team',
      'data_entry_supervisor',
      'data_entry_specialist',
    ]);
  });

  it('accepts an administrator and a normalized UserItem role', () => {
    expect(isEligibleModuleHandlerRoles('data_entry_resign', ['admin'])).toBe(true);
    expect(isEligibleModuleHandler('data_entry_resign', {
      roles: [{ role_id: 'r1', role_name: 'Data team', role_code: 'data_entry_team' }],
    })).toBe(true);
  });

  it('does not invent restrictions for modules without a handler role rule', () => {
    expect(isEligibleModuleHandlerRoles('resignation_cert', [])).toBe(true);
  });
});
