import baseConfig from "./jest.config";
import type { Config } from "jest";

const config: Config = {
  ...baseConfig,
  testRegex: undefined,
  testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"]
};

export default config;
