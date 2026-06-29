import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: "^(?!.*\\.(e2e|integration)-spec\\.ts$).*\\.spec\\.ts$",
  testPathIgnorePatterns: ["/node_modules/"],
  transform: { "^.+\\.(t|j)s$": "ts-jest" },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node"
};

export default config;
