import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessScope, DispatchModuleCode, ExceptionModuleHandler } from 'src/entities';
import { CreateExceptionModuleHandlerDto } from './dto/create-exception-module-handler.dto';
import { UpdateExceptionModuleHandlerDto } from './dto/update-exception-module-handler.dto';

type ExceptionModuleHandlerListQuery = {
  moduleCode?: DispatchModuleCode;
  customerCode?: string;
  businessScope?: BusinessScope;
};

@Injectable()
export class ExceptionModuleHandlersService {
  constructor(
    @InjectRepository(ExceptionModuleHandler)
    private readonly repository: Repository<ExceptionModuleHandler>,
  ) {}

  async list(query: ExceptionModuleHandlerListQuery = {}): Promise<ExceptionModuleHandler[]> {
    const normalizedCustomerCode = this.normalizeOptionalText(query.customerCode);
    const businessScope = query.businessScope ?? BusinessScope.BEILUN;
    return this.repository.find({
      where: {
        businessScope,
        ...(query.moduleCode ? { moduleCode: query.moduleCode } : {}),
        ...(normalizedCustomerCode ? { customerCode: normalizedCustomerCode } : {}),
      },
      order: { moduleCode: 'ASC', customerCode: 'ASC', createdAt: 'DESC' },
    });
  }

  async create(input: CreateExceptionModuleHandlerDto & { businessScope?: BusinessScope }): Promise<ExceptionModuleHandler> {
    const businessScope = input.businessScope ?? BusinessScope.BEILUN;
    const customerCode = this.normalizeRequiredText(input.customerCode, 'customerCode');
    await this.assertUnique(input.moduleCode, customerCode, undefined, businessScope);

    const entity = this.repository.create({
      moduleCode: input.moduleCode,
      businessScope,
      customerCode,
      handlerId: input.handlerId,
    });
    return this.repository.save(entity);
  }

  async update(id: string, input: UpdateExceptionModuleHandlerDto & { businessScope?: BusinessScope }): Promise<ExceptionModuleHandler> {
    const businessScope = input.businessScope ?? BusinessScope.BEILUN;
    const row = await this.repository.findOne({ where: { id, businessScope } });
    if (!row) {
      throw new NotFoundException('exception module handler 不存在');
    }

    const nextModuleCode = input.moduleCode ?? row.moduleCode;
    const nextCustomerCode = input.customerCode === undefined
      ? row.customerCode
      : this.normalizeRequiredText(input.customerCode, 'customerCode');

    if (nextModuleCode !== row.moduleCode || nextCustomerCode !== row.customerCode) {
      await this.assertUnique(nextModuleCode, nextCustomerCode, id, businessScope);
    }

    row.moduleCode = nextModuleCode;
    row.customerCode = nextCustomerCode;
    if (input.handlerId !== undefined) {
      row.handlerId = input.handlerId;
    }

    return this.repository.save(row);
  }

  async remove(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<{ success: boolean }> {
    const row = await this.repository.findOne({ where: { id, businessScope } });
    if (!row) {
      throw new NotFoundException('exception module handler 不存在');
    }
    await this.repository.delete(id);
    return { success: true };
  }

  private normalizeRequiredText(value: string, fieldName: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} 不能为空`);
    }
    return normalized;
  }

  private normalizeOptionalText(value?: string): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  }

  private async assertUnique(
    moduleCode: DispatchModuleCode,
    customerCode: string,
    excludeId?: string,
    businessScope: BusinessScope = BusinessScope.BEILUN,
  ): Promise<void> {
    const existing = await this.repository.findOne({ where: { moduleCode, customerCode, businessScope } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('同一客户同一模块的例外派发规则已存在');
    }
  }
}
