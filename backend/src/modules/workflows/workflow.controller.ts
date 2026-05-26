import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { assertUuidParam } from 'src/common/utils/uuid-param';
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
  get(@Param('id') id: string) {
    return this.workflowService.get(assertUuidParam(id, 'Workflow definition not found'));
  }

  @Post()
  create(@Body() payload: CreateWorkflowDto, @CurrentUser() user: JwtUserPayload) {
    return this.workflowService.create(payload, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() payload: UpdateWorkflowDto) {
    return this.workflowService.update(assertUuidParam(id, 'Workflow definition not found'), payload);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() payload: PublishWorkflowDto) {
    return this.workflowService.publish(assertUuidParam(id, 'Workflow definition not found'), payload);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.workflowService.deactivate(assertUuidParam(id, 'Workflow definition not found'));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflowService.remove(assertUuidParam(id, 'Workflow definition not found'));
  }
}
