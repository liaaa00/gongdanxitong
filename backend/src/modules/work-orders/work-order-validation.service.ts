import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import { FieldConfig, WorkOrder } from 'src/entities';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';

const STRICT_REQUIRED_FIELD_CODES = new Set([
  'employee_name',
  'id_card_no',
  'customer_name',
  'customer_code',
  'province',
  'current_address',
  'probation_months',
  'probation_end_date',
  'probation_salary',
  'social_insurance_result',
  'medical_insurance_result',
  'housing_fund_result',
]);

const STRICT_REQUIRED_FIELD_NAMES: Record<string, string> = {
  employee_name: '姓名',
  id_card_no: '身份证号',
  customer_name: '客户名称',
  customer_code: '客户代码',
  province: '省份',
  current_address: '现住地址',
  probation_months: '试用期（月）',
  probation_end_date: '试用期结束日期',
  probation_salary: '试用期工资',
  social_insurance_result: '社保是否办结',
  medical_insurance_result: '医保是否办结',
  housing_fund_result: '公积金是否办结',
};

@Injectable()
export class WorkOrderValidationService {
  constructor(
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    private readonly dataSource: DataSource,
    private readonly astEvaluator: AstEvaluator,
  ) {}

  async validateWorkOrder(workOrder: WorkOrder): Promise<void> {
    const fields = await this.fieldConfigRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    const missing: string[] = [];
    const missingNames: string[] = [];
    const invalid: Array<{ fieldCode: string; reason: string }> = [];

    for (const field of fields) {
      const appliesToOrder = field.orderType === null
        || field.orderType === workOrder.orderType
        || field.businessContext?.includes(workOrder.orderType) === true;
      if (!appliesToOrder) {
        continue;
      }

      const required = await this.isRequiredField(field, workOrder.extraData);
      const value = workOrder.extraData[field.fieldCode];
      if (required && !this.hasValue(value)) {
        if (STRICT_REQUIRED_FIELD_CODES.has(field.fieldCode)) {
          missing.push(field.fieldCode);
          missingNames.push(field.fieldName || field.fieldCode);
        }
        continue;
      }

      if (!this.hasValue(value)) {
        continue;
      }

      if (field.validationRegex) {
        const regex = new RegExp(field.validationRegex);
        if (!regex.test(String(value))) {
          invalid.push({ fieldCode: field.fieldCode, reason: field.validationMsg ?? 'regex' });
        }
      }
    }

    if (missing.length > 0) {
      const label = missingNames.length > 0 ? `：${missingNames.join('、')}` : '';
      throw businessException(4110, HttpStatus.BAD_REQUEST, `必填字段缺失${label}`, { missing });
    }

    if (invalid.length > 0) {
      throw businessException(4112, HttpStatus.BAD_REQUEST, '字段值不合法', { invalid });
    }
  }

  async isRequiredField(field: FieldConfig, extraData: Record<string, unknown>): Promise<boolean> {
    if (field.isRequired || field.defaultRequired) {
      return true;
    }
    if (!field.conditionalRequired) {
      return false;
    }

    const evaluated = await this.astEvaluator.evaluate(
      field.conditionalRequired as Record<string, unknown>,
      extraData,
    );
    return evaluated.result;
  }

  async resolveCustomerId(customerId: string | undefined, extraData: Record<string, unknown>): Promise<string> {
    if (customerId) {
      return customerId;
    }

    const customerCode = this.readText(extraData.customer_code);
    const customerName = this.readText(extraData.customer_name);
    const customer = await this.findCustomer(customerCode, customerName);
    if (customer) {
      return customer.id;
    }

    if (customerCode && customerName) {
      const created = await this.createCustomerFromWorkOrder(customerCode, customerName);
      return created.id;
    }

    throw businessException(3000, HttpStatus.BAD_REQUEST, '客户信息缺失：请填写客户名称和客户代码', {
      field: 'customerId',
      customerCode,
      customerName,
    });
  }

  async resolveBranchId(branchId: string | undefined, customerId: string, extraData: Record<string, unknown>): Promise<string | null> {
    if (branchId) {
      return branchId;
    }

    const branchCode = this.readText(extraData.branch_code) ?? this.readText(extraData.customer_code);
    if (branchCode) {
      const byCode = await this.dataSource.query(
        'SELECT id FROM branches WHERE branch_code = $1 AND is_active = true LIMIT 1',
        [branchCode],
      );
      if (Array.isArray(byCode) && byCode.length > 0) {
        return String(byCode[0].id);
      }
    }

    const fallback = await this.dataSource.query(
      'SELECT id FROM branches WHERE customer_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1',
      [customerId],
    );
    if (Array.isArray(fallback) && fallback.length > 0) {
      return String(fallback[0].id);
    }

    return null;
  }

  async resolveDepartmentId(departmentId: string | undefined, userId: string): Promise<string> {
    if (departmentId) {
      return departmentId;
    }

    const primary = await this.dataSource.query(
      'SELECT department_id FROM user_roles WHERE user_id = $1 AND is_primary = true LIMIT 1',
      [userId],
    );
    if (Array.isArray(primary) && primary.length > 0) {
      return String(primary[0].department_id);
    }

    const fallback = await this.dataSource.query(
      'SELECT department_id FROM user_roles WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    if (Array.isArray(fallback) && fallback.length > 0) {
      return String(fallback[0].department_id);
    }

    throw businessException(3000, HttpStatus.BAD_REQUEST, '部门信息缺失', { field: 'departmentId' });
  }

  async resolveUserDepartmentIds(userId: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `
      WITH RECURSIVE scoped_departments AS (
        SELECT d.id, d.parent_id
        FROM departments d
        INNER JOIN user_roles ur ON ur.department_id = d.id
        WHERE ur.user_id = $1 AND d.is_active = true
        UNION ALL
        SELECT child.id, child.parent_id
        FROM departments child
        INNER JOIN scoped_departments parent ON child.parent_id = parent.id
        WHERE child.is_active = true
      )
      SELECT DISTINCT id AS department_id FROM scoped_departments
      `,
      [userId],
    );
    return Array.isArray(rows) ? rows.map((row) => String(row.department_id)) : [];
  }

  async generateOrderNo(prefix = 'ON'): Promise<string> {
    const date = new Date();
    const yyyy = date.getFullYear().toString();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const orderPrefix = `${prefix}${yyyy}${mm}${dd}`;
    const count = await this.workOrderRepository.count({
      where: { orderNo: ILike(`${orderPrefix}%`) },
    });
    return `${orderPrefix}${String(count + 1).padStart(3, '0')}`;
  }

  requireText(value: unknown, fieldCode: string): string {
    const text = this.readText(value);
    if (!text) {
      const label = STRICT_REQUIRED_FIELD_NAMES[fieldCode];
      const message = label ? `必填字段缺失：${label}` : '必填字段缺失';
      throw businessException(4110, HttpStatus.BAD_REQUEST, message, { fieldCode });
    }
    return text;
  }

  readText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }

  hasValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  }

  normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '');
  }

  private async createCustomerFromWorkOrder(
    customerCode: string,
    customerName: string,
  ): Promise<{ id: string }> {
    const rows = await this.dataSource.query(
      `
        INSERT INTO customers (customer_code, customer_name, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (customer_code)
        DO UPDATE SET customer_name = EXCLUDED.customer_name, is_active = true
        RETURNING id
      `,
      [customerCode, customerName],
    );
    return { id: String(rows[0].id) };
  }

  private async findCustomer(
    customerCode: string | null,
    customerName: string | null,
  ): Promise<{ id: string } | null> {
    if (customerCode) {
      const byCode = await this.dataSource.query(
        'SELECT id FROM customers WHERE customer_code = $1 AND is_active = true LIMIT 1',
        [customerCode],
      );
      if (Array.isArray(byCode) && byCode.length > 0) {
        return { id: String(byCode[0].id) };
      }
    }

    if (customerName) {
      const byName = await this.dataSource.query(
        'SELECT id FROM customers WHERE customer_name = $1 AND is_active = true LIMIT 1',
        [customerName],
      );
      if (Array.isArray(byName) && byName.length > 0) {
        return { id: String(byName[0].id) };
      }
    }

    return null;
  }
}
