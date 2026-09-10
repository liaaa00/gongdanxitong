import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { AppConfig } from 'src/config/configuration';
import { Customer, CustomerPortalAccount, CustomerPortalRule } from 'src/entities';
import { PortalNotificationsService } from 'src/modules/portal-notifications/portal-notifications.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
/** Account-level grants. Onboarding and resignation share one grant. */
export const PORTAL_BUSINESS_PERMISSIONS = ['employee_changes', 'salary'] as const;
export type PortalBusinessPermission = typeof PORTAL_BUSINESS_PERMISSIONS[number];
/** Workflow business types remain separate because their forms and submissions differ. */
export const PORTAL_BUSINESS_TYPES = ['onboarding', 'resignation', 'salary'] as const;
export type PortalBusinessType = typeof PORTAL_BUSINESS_TYPES[number];

export function permissionForBusinessType(businessType: PortalBusinessType): PortalBusinessPermission {
  return businessType === 'salary' ? 'salary' : 'employee_changes';
}

export function normalizePortalBusinessPermissions(value: unknown): PortalBusinessPermission[] {
  const raw = Array.isArray(value) ? value : [];
  const hasEmployeeChanges = raw.some((permission) => permission === 'employee_changes' || permission === 'onboarding' || permission === 'resignation');
  const hasSalary = raw.some((permission) => permission === 'salary');
  return PORTAL_BUSINESS_PERMISSIONS.filter((permission) =>
    permission === 'employee_changes' ? hasEmployeeChanges : hasSalary,
  );
}

export function businessTypesForPermissions(value: unknown): PortalBusinessType[] {
  const permissions = normalizePortalBusinessPermissions(value);
  return [
    ...(permissions.includes('employee_changes') ? (['onboarding', 'resignation'] as const) : []),
    ...(permissions.includes('salary') ? (['salary'] as const) : []),
  ];
}

interface PortalSessionClaims {
  v: number;
  aud: string;
  customerId: string;
  accountId: string;
  sessionVersion: number;
  exp: number;
}

type AccountSecurityChanges = Partial<Pick<CustomerPortalAccount,
  'loginEmail' | 'contactName' | 'isActive' | 'mustChangePassword' | 'businessPermissions' | 'passwordHash'>>;

export interface SavePortalAccountInput {
  loginEmail?: string;
  contactName?: string;
  password?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  businessPermissions?: PortalBusinessPermission[];
}

@Injectable()
export class CustomerPortalAccountsService {
  constructor(
    @InjectRepository(CustomerPortalAccount)
    private readonly accountRepository: Repository<CustomerPortalAccount>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectRepository(CustomerPortalRule)
    private readonly ruleRepository: Repository<CustomerPortalRule>,
    private readonly notifications: PortalNotificationsService,
  ) {}

  async list(customerId: string) {
    await this.getCustomer(customerId);
    const rows = await this.accountRepository.find({
      where: { customerId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async create(customerId: string, input: SavePortalAccountInput) {
    const customer = await this.getCustomer(customerId);
    this.validateBooleans(input);
    const businessPermissions = this.validatePermissions(input.businessPermissions);
    await this.ensureRuleReady(customerId, businessPermissions);
    const loginEmail = this.normalizeEmail(input.loginEmail);
    const contactName = this.normalizeContactName(input.contactName);
    const password = this.validatePassword(input.password);
    await this.ensureEmailAvailable(loginEmail);
    const row = this.accountRepository.create({
      customerId,
      loginEmail,
      contactName,
      passwordHash: await bcrypt.hash(password, 10),
      isActive: input.isActive !== false,
      mustChangePassword: input.mustChangePassword !== false,
      businessPermissions,
      sessionVersion: 1,
      lastLoginAt: null,
    });
    return this.accountRepository.manager.transaction(async (manager) => {
      const saved = await manager.getRepository(CustomerPortalAccount).save(row);
      if (saved.isActive) await this.notifications.enqueueAccountActivation(manager, this.activationNoticeAccount(saved), customer);
      return this.toView(saved);
    });
  }

  async update(customerId: string, accountId: string, input: SavePortalAccountInput) {
    const row = await this.getAccount(customerId, accountId);
    this.validateBooleans(input);
    const currentPermissions = normalizePortalBusinessPermissions(row.businessPermissions);
    const nextPermissions = input.businessPermissions === undefined
      ? currentPermissions
      : this.validatePermissions(input.businessPermissions);
    const addedPermissions = nextPermissions.filter((permission) => !currentPermissions.includes(permission));
    if ((input.isActive ?? row.isActive) && (!row.isActive || addedPermissions.length > 0)) {
      await this.ensureRuleReady(customerId, row.isActive ? addedPermissions : nextPermissions);
    }
    const changes: AccountSecurityChanges = {};
    if (input.loginEmail !== undefined) {
      const loginEmail = this.normalizeEmail(input.loginEmail);
      await this.ensureEmailAvailable(loginEmail, row.id);
      changes.loginEmail = loginEmail;
    }
    if (input.contactName !== undefined) changes.contactName = this.normalizeContactName(input.contactName);
    if (input.isActive !== undefined) changes.isActive = input.isActive;
    if (input.mustChangePassword !== undefined) changes.mustChangePassword = input.mustChangePassword;
    if (input.businessPermissions !== undefined) changes.businessPermissions = nextPermissions;
    if (!row.isActive && changes.isActive) {
      const customer = await this.getCustomer(customerId);
      await this.accountRepository.manager.transaction(async (manager) => {
        await this.updateSecuritySettings(row, changes, manager.getRepository(CustomerPortalAccount));
        await this.notifications.enqueueAccountActivation(manager, this.activationNoticeAccount({ ...row, ...changes, sessionVersion: row.sessionVersion + 1 }), customer);
      });
    } else await this.updateSecuritySettings(row, changes);
    return this.toView(await this.getAccount(customerId, accountId));
  }

  async resetPassword(customerId: string, accountId: string, password: string, mustChangePassword = true) {
    const row = await this.getAccount(customerId, accountId);
    this.validateBooleans({ mustChangePassword });
    await this.updateSecuritySettings(row, {
      passwordHash: await bcrypt.hash(this.validatePassword(password), 10),
      mustChangePassword,
    });
    return this.toView(await this.getAccount(customerId, accountId));
  }

  async login(loginEmailInput: string, password: string) {
    const loginEmail = this.normalizeEmail(loginEmailInput);
    const row = await this.accountRepository.findOne({
      where: { loginEmail },
      relations: { customer: true },
    });
    if (!row || !row.isActive || !row.customer?.isActive || !(await bcrypt.compare(password || '', row.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误，或账号已停用');
    }
    // A login must not overwrite a concurrent password reset or permission change.
    await this.accountRepository.update({ id: row.id }, { lastLoginAt: new Date() });
    return this.sessionView(row);
  }

  async session(linkToken: string, businessType?: PortalBusinessType) {
    const { row, claims } = await this.authenticateSession(linkToken);
    if (businessType !== undefined) {
      if (row.mustChangePassword) throw new ForbiddenException('请先修改初始密码后再办理业务');
      const permission = permissionForBusinessType(businessType);
      if (!normalizePortalBusinessPermissions(row.businessPermissions).includes(permission)) {
        throw new ForbiddenException('当前账号未获授权办理该业务');
      }
    }
    return this.sessionView(row, claims.exp, linkToken);
  }

  async changePassword(linkToken: string, oldPassword: string, newPassword: string) {
    const { row } = await this.authenticateSession(linkToken);
    const password = this.validatePassword(newPassword);
    if (typeof oldPassword !== 'string' || !(await bcrypt.compare(oldPassword, row.passwordHash))) {
      throw new BadRequestException('原密码错误');
    }
    if (await bcrypt.compare(password, row.passwordHash)) throw new BadRequestException('新密码不能与原密码相同');
    await this.updateSecuritySettings(row, {
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: false,
    });
    const updated = await this.accountRepository.findOne({ where: { id: row.id, customerId: row.customerId }, relations: { customer: true } });
    if (!updated?.isActive || !updated.customer?.isActive) throw new UnauthorizedException('账号已停用，请重新登录');
    return this.sessionView(updated);
  }

  private activationNoticeAccount(row: CustomerPortalAccount) {
    return { id: row.id, customerId: row.customerId, sessionVersion: row.sessionVersion, loginEmail: row.loginEmail, contactName: row.contactName, businessPermissions: row.businessPermissions, isActive: row.isActive };
  }

  private async updateSecuritySettings(row: CustomerPortalAccount, changes: AccountSecurityChanges, repository = this.accountRepository) {
    const result = await repository.update(
      { id: row.id, customerId: row.customerId, sessionVersion: row.sessionVersion },
      { ...changes, sessionVersion: row.sessionVersion + 1 },
    );
    if (result.affected !== 1) throw new ConflictException('账号设置已变化，请刷新后重试');
  }

  private async authenticateSession(linkToken: string) {
    const claims = this.verifyLinkToken(linkToken);
    const row = await this.accountRepository.findOne({
      where: { id: claims.accountId, customerId: claims.customerId },
      relations: { customer: true },
    });
    if (!row?.isActive || !row.customer?.isActive || row.sessionVersion !== claims.sessionVersion) {
      throw new UnauthorizedException('门户登录已失效，请重新登录');
    }
    return { row, claims };
  }

  private sessionView(row: CustomerPortalAccount, expiresAt = Math.floor(Date.now() / 1000) + this.sessionSeconds(), linkToken?: string) {
    const businessPermissions = normalizePortalBusinessPermissions(row.businessPermissions);
    return {
      linkToken: linkToken || this.createLinkToken(row, expiresAt),
      expiresAt,
      businessPermissions,
      mustChangePassword: row.mustChangePassword,
      account: {
        id: row.id,
        loginEmail: row.loginEmail,
        contactName: row.contactName,
        mustChangePassword: row.mustChangePassword,
        businessPermissions,
      },
      customer: {
        id: row.customer.id,
        customerCode: row.customer.customerCode,
        customerName: row.customer.customerName,
      },
    };
  }

  private async getCustomer(customerId: string) {
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('客户不存在');
    return customer;
  }

  private async getAccount(customerId: string, accountId: string) {
    const row = await this.accountRepository.findOne({ where: { id: accountId, customerId } });
    if (!row) throw new NotFoundException('门户账号不存在');
    return row;
  }

  private async ensureEmailAvailable(loginEmail: string, exceptId?: string) {
    const existing = await this.accountRepository.findOne({ where: { loginEmail } });
    if (existing && existing.id !== exceptId) throw new BadRequestException('该登录邮箱已被使用');
  }

  private normalizeEmail(value?: string) {
    const email = String(value || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 320) throw new BadRequestException('请输入有效的登录邮箱');
    return email;
  }

  private normalizeContactName(value?: string) {
    const contactName = String(value || '').trim();
    if (!contactName || contactName.length > 100) throw new BadRequestException('联系人姓名必填且不能超过 100 个字符');
    return contactName;
  }

  private validatePassword(value?: string) {
    const password = String(value || '');
    if (!PASSWORD_PATTERN.test(password) || Buffer.byteLength(password, 'utf8') > 72) throw new BadRequestException('密码须为 8 至 72 位（最多 72 字节），并同时包含字母和数字');
    return password;
  }

  private validatePermissions(value?: PortalBusinessPermission[]) {
    if (!Array.isArray(value) || value.length < 1 || value.length > PORTAL_BUSINESS_PERMISSIONS.length || new Set(value).size !== value.length
      || value.some((permission) => !PORTAL_BUSINESS_PERMISSIONS.includes(permission))) {
      throw new BadRequestException('请至少选择一项有效业务权限：增减员或薪资');
    }
    return PORTAL_BUSINESS_PERMISSIONS.filter((permission) => value.includes(permission));
  }

  private async ensureRuleReady(customerId: string, permissions: PortalBusinessPermission[]) {
    const rule = await this.ruleRepository.findOne({ where: { customerId } });
    const missing: string[] = [];
    if (!rule) missing.push('整套客户办理规则');
    else {
      if (!rule.isActive) missing.push('启用整套客户规则');
      if (permissions.includes('employee_changes')) {
        if (!rule.onboardingDefaults || Object.keys(rule.onboardingDefaults).length === 0) missing.push('入职规则');
        if (!rule.resignationDefaults || Object.keys(rule.resignationDefaults).length === 0) missing.push('离职规则');
      }
      if (permissions.includes('salary')) {
        const billingDay = rule.salaryRules?.billingDay;
        if (billingDay == null || !Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) missing.push('薪资账单日');
      }
      if (!String(rule.sharedEmailRules?.mailbox || '').trim()) missing.push('共享邮箱地址');
    }
    if (missing.length) throw new BadRequestException(`客户办理规则尚未完成，不能开通门户账号：${missing.join('、')}`);
  }

  private validateBooleans(input: Pick<SavePortalAccountInput, 'isActive' | 'mustChangePassword'>) {
    for (const key of ['isActive', 'mustChangePassword'] as const) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new BadRequestException(`${key} 必须为布尔值`);
    }
  }

  private sessionSeconds() {
    const configured = Number(process.env.PORTAL_SESSION_EXPIRES_SECONDS || 43_200);
    return Number.isInteger(configured) && configured >= 900 && configured <= 604_800 ? configured : 43_200;
  }

  private createLinkToken(row: CustomerPortalAccount, expiresAt: number) {
    const secret = this.linkSecret();
    const payload = {
      v: 1,
      aud: 'customer-portal',
      customerId: row.customer.id,
      customerName: row.customer.customerName,
      customerCode: row.customer.customerCode,
      accountId: row.id,
      sessionVersion: row.sessionVersion,
      exp: expiresAt,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private linkSecret() {
    const secret = process.env.PORTAL_LINK_SECRET || this.configService.get<string>('app.jwtSecret', { infer: true });
    if (!secret || secret.length < 32) throw new BadRequestException('客户门户登录密钥未配置或长度不足 32 位');
    return secret;
  }

  private verifyLinkToken(linkToken: string): PortalSessionClaims {
    const secret = this.linkSecret();
    try {
      if (typeof linkToken !== 'string' || linkToken.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(linkToken)) throw new Error();
      const [encoded, signature] = linkToken.split('.');
      const expected = createHmac('sha256', secret).update(encoded).digest();
      const supplied = Buffer.from(signature, 'base64url');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error();
      const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PortalSessionClaims;
      if (claims.v !== 1 || claims.aud !== 'customer-portal' || !Number.isInteger(claims.exp)
        || claims.exp <= Math.floor(Date.now() / 1000) || typeof claims.accountId !== 'string' || !claims.accountId
        || typeof claims.customerId !== 'string' || !claims.customerId
        || !Number.isInteger(claims.sessionVersion) || claims.sessionVersion < 1) throw new Error();
      return claims;
    } catch {
      throw new UnauthorizedException('门户登录已失效，请重新登录');
    }
  }

  private toView(row: CustomerPortalAccount) {
    return {
      id: row.id,
      customerId: row.customerId,
      loginEmail: row.loginEmail,
      contactName: row.contactName,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      businessPermissions: normalizePortalBusinessPermissions(row.businessPermissions),
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
