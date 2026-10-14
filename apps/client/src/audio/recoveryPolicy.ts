export const recoveryPolicy = {
  resolveTimeout: 8_000,
  startTimeout: 10_000,
  confirmTimeout: 3_000,
  stallTimeout: 15_000,
  recoveryTimeout: 50_000,
  maxRetries: 2,
  healthyReset: 20_000,
  retryDelays: [1_000, 3_000],
} as const;
