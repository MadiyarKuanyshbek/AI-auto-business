import { describe, expect, it } from "vitest";
import { EMPTY_FORM, buildPackageFromForm, type BuilderForm } from "../src/core/packageBuilder";
import { parsePackage } from "../src/core/package";
import { sha256Hex } from "../src/core/sha256";

const good: BuilderForm = {
  ...EMPTY_FORM,
  title: "Мой пакет Stage 1",
  targetSoftware: "1037525811, 1037525812",
  data: Uint8Array.from({ length: 2048 }, (_, i) => i & 0xff),
  address: "0x80000",
  algorithm: "demo-xor-add",
  backupAddress: "80000",
  backupLength: "800",
};

describe("package builder", () => {
  it("builds a package that parses back with a matching checksum", () => {
    const r = buildPackageFromForm(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pkg.id).toBe("мой-пакет-stage-1");
    expect(r.pkg.target.softwareNumbers).toEqual(["1037525811", "1037525812"]);
    expect(r.pkg.segments[0].address).toBe(0x80000);
    expect(r.pkg.segments[0].sha256).toBe(sha256Hex(good.data!));
    expect(r.pkg.procedure.backup).toMatchObject({ address: 0x80000, length: 0x800 });
    expect(parsePackage(JSON.parse(JSON.stringify(r.pkg))).ok).toBe(true);
  });

  it("explains every missing or wrong field", () => {
    const err = (over: Partial<BuilderForm>) => {
      const r = buildPackageFromForm({ ...good, ...over });
      return r.ok ? "" : r.error;
    };
    expect(err({ title: " " })).toMatch(/название/);
    expect(err({ version: "v1" })).toMatch(/Версия/);
    expect(err({ targetSoftware: "" })).toMatch(/номер ПО/);
    expect(err({ data: null })).toMatch(/файл/);
    expect(err({ address: "zz" })).toMatch(/Адрес записи/);
    expect(err({ securityLevel: "10" })).toMatch(/нечётным/);
    expect(err({ algorithm: "" })).toMatch(/алгоритм/);
    expect(err({ algorithm: "unknown" })).toMatch(/алгоритм/);
    expect(err({ backupLength: "" })).toMatch(/резервной копии/);
    expect(err({ txId: "x" })).toMatch(/txId/);
  });

  it("allows packages without security access and without erase", () => {
    const r = buildPackageFromForm({ ...good, securityLevel: "", eraseRoutine: "", checkRoutine: "0202" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pkg.procedure.security).toBeUndefined();
      expect(r.pkg.procedure.erase).toBeUndefined();
      expect(r.pkg.procedure.check).toEqual({ routineId: 0x202 });
    }
  });

  it("records the theme of an interface package", () => {
    const r = buildPackageFromForm({ ...good, category: "interface", themeId: "sport" });
    expect(r.ok && r.pkg.interface).toEqual({ theme: "sport" });
  });
});
