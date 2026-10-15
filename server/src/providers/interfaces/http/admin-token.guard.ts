import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AdminSessionService, type AdminRequest } from './admin-session.service';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly sessions: AdminSessionService) {}

  canActivate(context: ExecutionContext): boolean {
    this.sessions.authorize(context.switchToHttp().getRequest<AdminRequest>());
    return true;
  }
}
