import { Controller, Get } from '@nestjs/common';
import type { DailyBest } from '@lune/shared';

/**
 * 每日最佳歌曲(接口预留)。
 *
 * P4 阶段仅返回空 tracks,数据源/算法待后续接入。
 * 客户端据此渲染"敬请期待"占位。
 */
@Controller('daily-best')
export class DailyBestController {
  @Get()
  async today(): Promise<DailyBest> {
    return {
      date: new Date().toISOString().slice(0, 10),
      tracks: [],
    };
  }
}