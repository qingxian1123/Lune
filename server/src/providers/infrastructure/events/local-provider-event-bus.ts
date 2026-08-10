import { Injectable, Logger } from '@nestjs/common';
import type {
  ProviderDomainEvent,
  ProviderEventBusPort,
} from '../../domain/provider-domain';

@Injectable()
export class LocalProviderEventBus implements ProviderEventBusPort {
  private readonly logger = new Logger(LocalProviderEventBus.name);
  private readonly listeners = new Set<(event: ProviderDomainEvent) => void>();

  publish(event: ProviderDomainEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn(
          `provider event listener failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  subscribe(listener: (event: ProviderDomainEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
