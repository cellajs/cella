/** Span names follow `layer.domain.action`; add a name here when code starts a span with it. */
export const cdcSpanNames = { processWal: 'cdc.wal.process', createActivity: 'cdc.activity.create' } as const;

export const backendSpanNames = { activityBusReceive: 'sync.activitybus.receive' } as const;

export const frontendSpanNames = { messageProcess: 'sync.message.process' } as const;
