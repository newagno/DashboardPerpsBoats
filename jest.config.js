/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/backups/'],
  modulePathIgnorePatterns: ['<rootDir>/backups/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  }
};
