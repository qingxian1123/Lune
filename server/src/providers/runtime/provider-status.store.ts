import { Inject, Injectable } from '@nestjs/common';
import type {
  ProviderRuntimeStatus,
  ProviderStatusSnapshot,
} from '../domain/provider-domain';
import { LocalProviderEventBus } from '../infrastructure/events/local-provider-event-bus';

@Injectable()
export class ProviderStatusStore {
  private readonly values = new Map<string, ProviderStatusSnapshot>();

  constructor(@Inject(LocalProviderEventBus) private readonly events: LocalProviderEventBus) {}

  initialize(providerId: string, status: ProviderRuntimeStatus): void {
    if (this.values.has(providerId)) return;
    this.values.set(providerId, { status, changedAt: new Date().toISOString() });
  }

  set(providerId: string, status: ProviderRuntimeStatus, reason?: string): void {
    const current = this.get(providerId);
    const now = new Date().toISOString();
    this.values.set(providerId, {
      status,
      reason,
      changedAt: current.status === status ? current.changedAt : now,
      lastCheckedAt: now,
    });
    if (current.status !== status) {
      this.events.publish({
        type: 'provider.status-changed',
        providerId,
        from: current.status,
        to: status,
      });
    }
  }

  get(providerId: string): ProviderStatusSnapshot {
    return (
      this.values.get(providerId) || {
        status: 'disabled',
        changedAt: new Date(0).toISOString(),
      }
    );
  }
}
