import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ProviderApplicationError } from '../../application/provider-ports';

@Catch(ProviderApplicationError)
export class ProviderApplicationErrorFilter implements ExceptionFilter {
  catch(exception: ProviderApplicationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();
    const status = this.statusFor(exception.code);
    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: exception.message,
    });
  }

  private statusFor(code: string): number {
    if (code === 'PROVIDER_LOGIN_SESSION_NOT_FOUND') return HttpStatus.NOT_FOUND;
    if (code.endsWith('_UNSUPPORTED')) return HttpStatus.NOT_FOUND;
    if (code === 'PROVIDER_CREDENTIAL_STORE_READONLY') {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }
    return HttpStatus.BAD_REQUEST;
  }
}
