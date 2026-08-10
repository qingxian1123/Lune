import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('LUNE_ADMIN_TOKEN')?.trim();
    if (!expected) throw new ServiceUnavailableException('Provider 管理接口尚未配置');
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>();
    const authorization = request.headers?.authorization;
    const supplied =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7).trim()
        : '';
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    if (
      expectedBuffer.length !== suppliedBuffer.length ||
      !timingSafeEqual(expectedBuffer, suppliedBuffer)
    ) {
      throw new UnauthorizedException('Provider 管理凭据无效');
    }
    return true;
  }
}
