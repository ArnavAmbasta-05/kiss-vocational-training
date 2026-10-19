import type { Config } from 'jest';

const shared: Config = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

const config: Config = {
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['\\.int\\.test\\.ts$'],
    },
    {
      ...shared,
      displayName: 'integration',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.int.test.ts'],
    },
  ],
};

export default config;
