import { createInMemoryEventStore } from '@loomn/engine';
import { runEventStoreContract } from './event-store-contract';

runEventStoreContract('in-memory', () => createInMemoryEventStore());
