import {
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { ProviderAuthService } from '../../application/provider-auth.service';
import { EncryptedCredentialStore } from '../../infrastructure/credentials/encrypted-credential.store';
import { ProviderRegistry } from '../../provider.registry';
import { AdminTokenGuard } from './admin-token.guard';
import { ProviderConfigService } from '../../infrastructure/config/provider-config.service';

class UpdateProviderConfigDto {
  @IsBoolean()
  enabled!: boolean;
}

@Controller('admin/providers')
@UseGuards(AdminTokenGuard)
export class ProviderAdminController {
  constructor(
    @Inject(ProviderRegistry) private readonly registry: ProviderRegistry,
    @Inject(ProviderAuthService) private readonly auth: ProviderAuthService,
    @Inject(EncryptedCredentialStore) private readonly credentials: EncryptedCredentialStore,
    @Inject(ProviderConfigService) private readonly config: ProviderConfigService,
  ) {}

  @Get()
  list() {
    return {
      providers: this.registry.listAllDetails().map(({ descriptor, active, status }) => {
        const credential = this.credentials.get(descriptor.id);
        return {
          ...descriptor,
          active,
          ...status,
          account: credential
            ? {
                id: credential.accountId,
                name: credential.accountName,
                updatedAt: credential.updatedAt,
                lastValidatedAt: credential.lastValidatedAt,
                credentialVersion: this.credentials.getVersion(descriptor.id),
              }
            : null,
        };
      }),
    };
  }

  @Post(':id/login')
  @Header('Cache-Control', 'no-store')
  login(@Param('id') id: string) {
    return this.auth.beginLogin(id);
  }

  @Get(':id/login/:sessionId')
  @Header('Cache-Control', 'no-store')
  loginStatus(@Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.auth.getLoginSession(id, sessionId);
  }

  @Delete(':id/login/:sessionId')
  cancelLogin(@Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.auth.cancelLogin(id, sessionId);
  }

  @Post(':id/validate')
  validate(@Param('id') id: string) {
    return this.auth.validate(id);
  }

  @Post(':id/refresh')
  refresh(@Param('id') id: string) {
    return this.auth.refresh(id);
  }

  @Post(':id/logout')
  async logout(@Param('id') id: string) {
    await this.auth.logout(id);
    return { ok: true };
  }

  @Patch(':id/config')
  async updateConfig(@Param('id') id: string, @Body() body: UpdateProviderConfigDto) {
    return {
      config: await this.config.setEnabled(id, body.enabled),
      restartRequired: true,
    };
  }
}
