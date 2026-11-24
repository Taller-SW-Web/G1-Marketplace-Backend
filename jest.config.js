module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  modulePathIgnorePatterns: ['<rootDir>/.audit/'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': '@swc/jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
  ],
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 45,
      functions: 55,
      lines: 60,
    },
  },
  testEnvironment: 'node',
};
