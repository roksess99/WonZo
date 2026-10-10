import { describe, expect, it } from "vitest";
import { connectionOptions, parseDbConfig, SESSION_SETUP_SQL } from "@/lib/db/config.mjs";
import { testDatabaseEnv } from "../integration/db-env";

const full = {
  DATABASE_HOST: "db.example.test",
  DATABASE_PORT: "3306",
  DATABASE_NAME: "wonzo_dev",
  DATABASE_USER: "wonzo",
  DATABASE_PASSWORD: " secret with spaces ",
};

describe("parseDbConfig — checked at start-up (D-06)", () => {
  it("no settings at all: no database, the shop runs on the mock", () => {
    expect(parseDbConfig({})).toBeNull();
    expect(parseDbConfig({ DATABASE_HOST: " ", DATABASE_NAME: "" })).toBeNull();
  });

  it("reads a full set, keeps the password exactly", () => {
    expect(parseDbConfig(full)).toEqual({ host: "db.example.test", port: 3306, database: "wonzo_dev", user: "wonzo", password: " secret with spaces " });
    expect(parseDbConfig({ ...full, DATABASE_PORT: "" })?.port).toBe(3306);
  });

  it("refuses half a set and names what is missing", () => {
    expect(() => parseDbConfig({ DATABASE_HOST: "db.example.test" })).toThrow(/DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD not set/);
  });

  it("refuses a port that is not a port", () => {
    expect(() => parseDbConfig({ ...full, DATABASE_PORT: "33o6" })).toThrow(/not a port number/);
    expect(() => parseDbConfig({ ...full, DATABASE_PORT: "70000" })).toThrow(/not a port number/);
  });
});

describe("session settings", () => {
  it("turns on strict mode and UTC (GEMETEN 2026-10-06: the server has no strict mode)", () => {
    expect(SESSION_SETUP_SQL).toMatch(/STRICT_ALL_TABLES/);
    expect(SESSION_SETUP_SQL).toMatch(/time_zone = '\+00:00'/);
  });

  it("returns big numbers safely and dates as UTC strings", () => {
    const o = connectionOptions(parseDbConfig(full)!);
    expect(o).toMatchObject({ charset: "utf8mb4", supportBigNumbers: true, bigNumberStrings: false, dateStrings: true });
  });
});

describe("the integration tests' database guard", () => {
  const test = { TEST_DATABASE_HOST: "h", TEST_DATABASE_NAME: "u1_wonzo_test", TEST_DATABASE_USER: "u", TEST_DATABASE_PASSWORD: "p" };

  it("maps TEST_DATABASE_* onto DATABASE_*, on the mock catalog", () => {
    expect(testDatabaseEnv({ ...test, DATABASE_NAME: "u1_wonzo_dev", CATALOG_SOURCE: "database" })).toMatchObject({
      DATABASE_NAME: "u1_wonzo_test", DATABASE_HOST: "h", CATALOG_SOURCE: "mock",
    });
  });

  it("refuses a database that is not a test database, or is the dev one", () => {
    expect(() => testDatabaseEnv({ ...test, TEST_DATABASE_NAME: "u1_wonzo" })).toThrow(/must contain "test"/);
    expect(() => testDatabaseEnv({ ...test, DATABASE_NAME: "u1_wonzo_test" })).toThrow(/same database/);
    expect(() => testDatabaseEnv({ TEST_DATABASE_NAME: "x_test" })).toThrow(/TEST_DATABASE_HOST, TEST_DATABASE_USER, TEST_DATABASE_PASSWORD not set/);
  });
});
