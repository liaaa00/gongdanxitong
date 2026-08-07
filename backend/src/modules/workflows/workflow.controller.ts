import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { assertUuidParam } from 'src/common/utils/uuid-param';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { CreateWorkflowDto, ListWorkflowQueryDto, PublishWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { WorkflowService } from './workflow.service';

@Roles('admin')
@Controller('admin/workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  list(@Query() query: ListWorkflowQueryDto) {
    return this.workflowService.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.workflowService.get(assertUuidParam(id, 'Workflow definition not found'), businessScope);
  }

  @Post()
  create(@Body() payload: CreateWorkflowDto, @CurrentUser() user: JwtUserPayload, @Query('businessScope') businessScope?: BusinessScope) {
    return this.workflowService.create({ ...payload, businessScope: payload.businessScope ?? businessScope }, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() payload: UpdateWorkflowDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.workflowService.update(assertUuidParam(id, 'Workflow definition not found'), { ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() payload: PublishWorkflowDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.workflowService.publish(assertUuidParam(id, 'Workflow definition not found'), { ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.workflowService.deactivate(assertUuidParam(id, 'Workflow definition not found'), businessScope);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.workflowService.remove(assertUuidParam(id, 'Workflow definition not found'), businessScope);
  }
}
