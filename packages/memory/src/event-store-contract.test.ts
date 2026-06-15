import { createInMemoryEventStore } from '@loomn/engine';
import { createSqliteEventStore } from './sqlite-event-store';
import { runEventStoreContract } from './event-store-contract';

runEventStoreContract('in-memory', () => createInMemoryEventStore());
runEventStoreContract('sqlite (:memory:)', () => createSqliteEventStore(':memory:'));
