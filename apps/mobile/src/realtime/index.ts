export * from './client';
export * from './room-client';

import { RealtimeClient } from './client';

let sharedRealtimeClient: RealtimeClient | null = null;

export function getSharedRealtimeClient(): RealtimeClient {
  if (!sharedRealtimeClient) {
    sharedRealtimeClient = new RealtimeClient();
  }
  return sharedRealtimeClient;
}
