import { describe, expect, it } from "vitest";
import { explainAdbError, parseAddress, parseDevices, parsePackages, validPackageName } from "../src/core/adb";

describe("ADB: разбор", () => {
  it("адрес магнитолы", () => {
    expect(parseAddress("192.168.1.50")).toEqual({ ok: true, address: "192.168.1.50:5555" });
    expect(parseAddress(" 10.0.0.2:6000 ")).toEqual({ ok: true, address: "10.0.0.2:6000" });
    expect(parseAddress("abc").ok).toBe(false);
    expect(parseAddress("300.1.1.1").ok).toBe(false);
    expect(parseAddress("1.1.1.1:99999").ok).toBe(false);
    expect(parseAddress("1.1.1.1; rm -rf").ok).toBe(false);
  });
  it("список устройств", () => {
    const out = "List of devices attached\n192.168.1.50:5555\tdevice\nemulator-5554\tunauthorized\n\n";
    expect(parseDevices(out)).toEqual([
      { id: "192.168.1.50:5555", state: "device" },
      { id: "emulator-5554", state: "unauthorized" },
    ]);
    expect(parseDevices("List of devices attached\n")).toEqual([]);
  });
  it("список пакетов и имена", () => {
    expect(parsePackages("package:com.b.app\r\npackage:com.a.app\n")).toEqual(["com.a.app", "com.b.app"]);
    expect(validPackageName("ru.yandex.yandexnavi")).toBe(true);
    expect(validPackageName("bad name; x")).toBe(false);
    expect(validPackageName("nodots")).toBe(false);
  });
  it("понятные ошибки", () => {
    expect(explainAdbError("failed to connect: Connection refused")).toContain("отказала");
    expect(explainAdbError("adb: device unauthorized")).toContain("Разрешить");
    expect(explainAdbError("Failure [INSTALL_FAILED_ALREADY_EXISTS]")).toContain("уже установлено");
  });
});
