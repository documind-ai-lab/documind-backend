import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testMatch: [
    "<rootDir>/test/**/*.spec.ts",
    "!<rootDir>/test/**/*.e2e-spec.ts",
    "!<rootDir>/test/**/*.integration-spec.ts"
  ],
  testPathIgnorePatterns: ["/node_modules/"],
  transform: { "^.+\\.(t|j)s$": "ts-jest" },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node"
};

export default config;
