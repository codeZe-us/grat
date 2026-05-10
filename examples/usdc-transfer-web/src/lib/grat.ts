import { Grat } from '@grat-official-sdk/sdk';
import { RELAY_URL } from './constants';

export const grat = new Grat({ relayUrl: RELAY_URL });
