import { Module } from '@nestjs/common';
import { ChartsModule } from '../charts/charts.module';
import { ProvidersModule } from '../providers/providers.module';
import { RoomsModule } from '../rooms/rooms.module';
import { SyncGateway } from './sync.gateway';
import { ConnectionRegistry } from './connection.registry';

@Module({
  imports: [RoomsModule, ChartsModule, ProvidersModule],
  providers: [SyncGateway, ConnectionRegistry],
  exports: [ConnectionRegistry],
})
export class SyncModule {}
