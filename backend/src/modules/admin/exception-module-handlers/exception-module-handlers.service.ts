import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchModuleCode, ExceptionModuleHandler } from 'src/entities';
import { CreateExceptionModuleHandlerDto } from './dto/create-exception-module-handler.dto';
import { UpdateExceptionModuleHandlerDto } from './dto/update-exception-module-handler.dto';

type ExceptionModuleHandlerListQuery = {
  moduleCode?: DispatchModuleCode;
  customerCode?: string;
};

@Injectable()
export class ExceptionModuleHandlersService {
  constructor(
    @InjectRepository(ExceptionModuleHandler)
    private readonly repository: Repository<ExceptionModuleHandler>,
  ) {}

  async list(query: ExceptionModuleHandlerListQuery = {}): Promise<ExceptionModuleHandler[]> {
    const normalizedCustomerCode = this.normalizeOptionalText(query.customerCode);
    return this.repository.find({
      where: {
        ...(query.moduleCode ? { moduleCode: query.moduleCode } : {}),
        ...(normalizedCustomerCode ? { customerCode: normalizedCustomerCode } : {}),
      },
      order: { moduleCode: 'ASC', customerCode: 'ASC', createdAt: 'DESC' },
    });
  }

  async create(input: CreateExceptionModuleHandlerDto): Promise<ExceptionModuleHandler> {
    const customerCode = this.normalizeRequiredText(input.customerCode, 'customerCode');
    await this.assertUnique(input.moduleCode, customerCode);

    const entity = this.repository.create({
      moduleCode: input.moduleCode,
      customerCode,
      handlerId: input.handlerId,
    });
    return this.repository.save(entity);
  }

  async update(id: string, input: UpdateExceptionModuleHandlerDto): Promise<ExceptionModuleHandler> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('exception module handler 不存在');
    }

    const nextModuleCode = input.moduleCode ?? row.moduleCode;
    const nextCustomerCode = input.customerCode === undefined
      ? row.customerCode
      : this.normalizeRequiredText(input.customerCode, 'customerCode');

    if (nextModuleCode !== row.moduleCode || nextCustomerCode !== row.customerCode) {
      await this.assertUnique(nextModuleCode, nextCustomerCode, id);
    }

    row.moduleCode = nextModuleCode;
    row.customerCode = nextCustomerCode;
    if (input.handlerId !== undefined) {
      row.handlerId = input.handlerId;
    }

    return this.repository.save(row);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const row = await this.repository.findOne({ where: { id } });
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
  ): Promise<void> {
    const existing = await this.repository.findOne({ where: { moduleCode, customerCode } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('同一客户同一模块的例外派发规则已存在');
    }
  }
}
