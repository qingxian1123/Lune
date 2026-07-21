import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { SyncGateway } from './sync.gateway';
import { ConnectionRegistry } from './connection.registry';

@Module({
  imports: [RoomsModule],
  providers: [SyncGateway, ConnectionRegistry],
  exports: [ConnectionRegistry],
})
export class SyncModule {}