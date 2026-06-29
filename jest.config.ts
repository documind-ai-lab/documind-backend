import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/", "\\.e2e-spec\\.ts$", "\\.integration-spec\\.ts$"],
  transform: { "^.+\\.(t|j)s$": "ts-jest" },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node"
};

export default config;
