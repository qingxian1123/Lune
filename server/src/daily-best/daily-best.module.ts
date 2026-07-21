import { Module } from '@nestjs/common';
import { DailyBestController } from './daily-best.controller';

@Module({
  controllers: [DailyBestController],
})
export class DailyBestModule {}