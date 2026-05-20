import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import {
  DispatchRule,
  FieldConfig,
  FieldPermission,
  FieldType,
  OrderType,
  WorkOrder,
} from 'src/entities';
import { AstValidator } from 'src/modules/dispatch/ast.validator';

interface SaveFieldInput {
  fieldCode: string;
  fieldName: string;
  fieldType: FieldType;
  isRequired: boolean;
  defaultRequired: boolean;
  validationRegex?: string | null;
  validationMsg?: string | null;
  dropdownOptions?: string[] | null;
  placeholder?: string | null;
  helpText?: string | null;
  orderType?: OrderType | null;
  businessContext?: OrderType[] | null;
  conditionalRequired?: Record<string, unknown> | null;
  displayOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class FieldsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FieldConfig)
    private readonly fieldRepository: Repository<FieldConfig>,
    @InjectRepository(FieldPermission)
    private readonly fieldPermissionRepository: Repository<FieldPermission>,
    @InjectRepository(DispatchRule)
    private readonly dispatchRuleRepository: Repository<DispatchRule>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    private readonly astValidator: AstValidator,
  ) {}

  async list(
    query: PaginationQueryDto & { orderType?: OrderType | 'common' },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.fieldRepository.createQueryBuilder('field');

    if (query.orderType === 'common') {
      qb.andWhere('field.orderType IS NULL');
    } else if (query.orderType) {
      qb.andWhere(
        '(field.orderType = :orderType OR field.businessContext @> :businessContext)',
        {
          orderType: query.orderType,
          businessContext: JSON.stringify([query.orderType]),
        },
      );
    }

    if (query.keyword) {
      qb.andWhere(
        '(field.fieldCode ILIKE :keyword OR field.fieldName ILIKE :keyword)',
        {
          keyword: `%${query.keyword}%`,
        },
      );
    }

    qb.orderBy('field.displayOrder', 'ASC').addOrderBy('field.createdAt', 'ASC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return toPageResult(page, pageSize, total, rows);
  }

  async create(input: SaveFieldInput): Promise<FieldConfig> {
    const existed = await this.fieldRepository.findOne({
      where: { fieldCode: input.fieldCode },
    });
    if (existed) {
      throw new BadRequestException('字段编码已存在');
    }

    this.assertDropdownConstraints(input.fieldType, input.dropdownOptions);

    const orderType = input.orderType ?? null;
    const businessContext = orderType
      ? Array.from(new Set([...(input.businessContext ?? []), orderType]))
      : input.businessContext ?? null;

    const entity = this.fieldRepository.create({
      ...input,
      isActive: input.isActive ?? true,
      orderType,
      businessContext,
      displayOrder: input.displayOrder ?? 0,
    });

    return this.fieldRepository.save(entity);
  }

  async update(id: string, input: Partial<SaveFieldInput>): Promise<FieldConfig> {
    const row = await this.fieldRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('字段不存在');
    }

    if (input.fieldCode && input.fieldCode !== row.fieldCode) {
      throw new BadRequestException('字段编码不允许修改');
    }

    this.assertDropdownConstraints(
      input.fieldType ?? row.fieldType,
      input.dropdownOptions ?? row.dropdownOptions,
    );

    Object.assign(row, input);

    if (row.orderType) {
      const existing = row.businessContext ?? [];
      row.businessContext = Array.from(new Set([...existing, row.orderType]));
    }

    return this.fieldRepository.save(row);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const row = await this.fieldRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('字段不存在');
    }

    const fieldCode = row.fieldCode;

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(FieldPermission, { fieldCode });

      await manager
        .createQueryBuilder()
        .update(WorkOrder)
        .set({ extraData: () => `COALESCE("extra_data", '{}'::jsonb) - :fieldCode` })
        .setParameter('fieldCode', fieldCode)
        .execute();

      await manager.delete(FieldConfig, { id });
      return { success: true };
    });
  }

  async reorder(
    items: Array<{
      id: string;
      displayOrder: number;
    }>,
  ): Promise<{ affected: number }> {
    return this.dataSource.transaction(async (manager) => {
      for (const item of items) {
        await manager.update(FieldConfig, { id: item.id }, { displayOrder: item.displayOrder });
      }
      return { affected: items.length };
    });
  }

  validateRuleAst(ast: Record<string, unknown> | null): void {
    this.astValidator.validate(ast);
  }

  private assertDropdownConstraints(
    fieldType: FieldType,
    options: string[] | null | undefined,
  ): void {
    const isDropdown = fieldType === FieldType.DROPDOWN;

    if (isDropdown && (!options || options.length === 0)) {
      throw new BadRequestException('下拉字段必须配置 options');
    }

    if (!isDropdown && options && options.length > 0) {
      throw new BadRequestException('非下拉字段不能配置 options');
    }
  }
}
