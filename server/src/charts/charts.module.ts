import { BadRequestException, Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { HeartStore } from './heart.store';

@Controller('charts')
export class ChartsController {
  constructor(@Inject(HeartStore) private readonly hearts: HeartStore) {}

  @Get('hot')
  hot(@Query('window') window = '7d', @Query('limit') rawLimit = '20', @Query('provider') provider = 'all',
      @Query('providers') providers?: string) {
    const limit = Number(rawLimit);
    const providerId = /^[a-zA-Z0-9_-]{1,64}$/;
    if (window !== '7d' || !Number.isInteger(limit) || limit < 1 ||
        typeof provider !== 'string' || !providerId.test(provider) ||
        (providers !== undefined && (typeof providers !== 'string' || providers.length > 512 ||
          !providers.split(',').every((id) => providerId.test(id) && id !== 'all')))) {
      throw new BadRequestException('无效的热榜查询参数');
    }
    return this.hearts.chart(providers ? providers.split(',') : provider, Math.min(limit, 50));
  }
}

@Module({
  controllers: [ChartsController],
  providers: [{
    provide: HeartStore,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => new HeartStore(resolve(config.get<string>('LUNE_DATA_DIR') || 'data', 'hearts.json')),
  }],
  exports: [HeartStore],
})
export class ChartsModule {}
