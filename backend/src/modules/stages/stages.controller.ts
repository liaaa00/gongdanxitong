import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { CreateOrderStageDto, ListOrderStagesDto } from './dto';
import { StagesService } from './stages.service';

@Controller('stages')
export class StagesController {
  constructor(private readonly service: StagesService) {}

  @Post()
  create(@Body() payload: CreateOrderStageDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(payload, user);
  }

  @Get()
  list(@Query() query: ListOrderStagesDto) {
    return this.service.list(query);
  }
}
