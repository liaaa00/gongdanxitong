import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RequestWithTraceId } from 'src/common/middleware/trace-id.middleware';

interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  traceId: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | StreamableFile>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | StreamableFile> {
    const request = context.switchToHttp().getRequest<RequestWithTraceId>();
    const traceId = request.traceId ?? 'req_unknown';

    return next.handle().pipe(
      map((data: T) => {
        if (data instanceof StreamableFile) {
          return data;
        }
        return {
          code: 0,
          data,
          message: 'ok',
          traceId,
        };
      }),
    );
  }
}
