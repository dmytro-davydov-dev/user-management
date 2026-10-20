import { testDatabaseUrl } from './test-database';

// Runs in each test worker before AppModule's ConfigModule reads the environment.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
