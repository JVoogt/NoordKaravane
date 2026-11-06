module.exports = {
  transform: { "^.+\\.[jt]sx?$": ["@swc/jest", { jsc: { parser: { syntax: "typescript", decorators: true }, target: "es2021" } }] },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["<rootDir>/.medusa/"],
  testPathIgnorePatterns: ["/node_modules/", "/.medusa/"],
  testMatch: ["**/src/**/__tests__/**/*.unit.spec.[jt]s"],
}
