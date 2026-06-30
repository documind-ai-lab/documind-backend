import baseConfig from "./jest.config";
import type { Config } from "jest";

const config: Config = {
  ...baseConfig,
  testRegex: undefined,
  testMatch: ["<rootDir>/test/**/*.integration-spec.ts"]
};

export default config;
