import { webcrypto } from 'node:crypto';
global.crypto = webcrypto as unknown as typeof global.crypto