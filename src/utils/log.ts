import { log as apifyLog } from 'apify';

export function createLogger(prefix: string) {
  return (msg: string, data?: any) => {
    if (data) {
      apifyLog.info(`[${prefix}] ${msg}`, data);
    } else {
      apifyLog.info(`[${prefix}] ${msg}`);
    }
  };
}
