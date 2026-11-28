import { describe, expect, it } from "vitest";
import { buildQueries, classifyUrl, extVerdict } from "../src/core/finder";

describe("поиск файлов: оценка источника", () => {
  it("различает производителя, магазин, сообщество и файлообменник", () => {
    expect(classifyUrl("https://www.changaneurope.com/uk/owners/software-and-updates").trust).toBe("official");
    expect(classifyUrl("https://get.videolan.org/vlc-android/3.7.0/x.apk").trust).toBe("store");
    expect(classifyUrl("https://github.com/x/y/releases/download/v1/a.zip").trust).toBe("community");
    expect(classifyUrl("https://mega.nz/file/abc").trust).toBe("filehost");
    expect(classifyUrl("https://random-site.example/file.bin").trust).toBe("unknown");
  });
  it("не принимает подделку домена производителя и адреса без https", () => {
    expect(classifyUrl("https://changaneurope.com.evil.example/update.zip").trust).toBe("unknown");
    expect(classifyUrl("https://notchanganeurope.com/x").trust).toBe("unknown");
    expect(classifyUrl("http://www.changaneurope.com/x").label).toContain("не https");
    expect(classifyUrl("мусор").trust).toBe("unknown");
  });
  it("запрещает скачивать исполняемые файлы", () => {
    expect(extVerdict("setup.exe").ok).toBe(false);
    expect(extVerdict("script.ps1").ok).toBe(false);
    expect(extVerdict("firmware.bin").ok).toBe(true);
    expect(extVerdict("app.apk").ok).toBe(true);
    expect(extVerdict("weird.xyz").ok).toBe(false);
  });
  it("запросы строятся из марки, модели и года без VIN", () => {
    const q = buildQueries("russify", { make: "Chery", model: "Tiggo 8", year: 2021 });
    expect(q.length).toBeGreaterThan(1);
    expect(q.every((x) => x.includes("Chery") && x.includes("Tiggo 8"))).toBe(true);
    expect(q.join(" ")).not.toMatch(/WVW|VIN/);
  });
});
