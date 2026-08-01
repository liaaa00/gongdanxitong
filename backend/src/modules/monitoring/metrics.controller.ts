import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get()
  async scrape(@Res() response: Response): Promise<void> {
    response.setHeader('Content-Type', this.metricsService.contentType);
    response.send(await this.metricsService.metrics());
  }
}
