// Мост настольного приложения (desktop/preload.cjs). В браузере и на телефоне его нет.
export type ChooserKind = "bluetooth" | "serial";
export type ChooserDevice = { id: string; name: string };
export type FirmwareBackupMeta = { id: string; vin: string; ecuName: string; txId: string; software: string; pkgId: string; pkgVersion: string; at: number; size: number; sha256: string; file: string };
export type QuarantineItem = {
  id: string;
  name: string;
  sourceUrl: string;
  at: number;
  size: number;
  sha256: string;
  type: "apk" | "zip" | "pdf" | "json" | "bin" | "exe" | "elf";
  defender: "clean" | "threat" | "unavailable" | "error" | "skipped";
  warnings: string[];
  /** Для APK: процессоры, под которые собрано приложение (пусто: нет своих библиотек). */
  abis: string[];
  blocked: boolean;
};

export type DesktopBridge = {
  desktop: true;
  platform: string;
  tcp: {
    connect(host: string, port: number): Promise<number>;
    write(id: number, text: string): Promise<void>;
    close(id: number): void;
    onData(cb: (id: number, text: string) => void): () => void;
    onClose(cb: (id: number) => void): () => void;
  };
  backup: {
    save(json: string, name?: string): Promise<string>;
    openFolder(): Promise<string>;
    saveAs(json: string): Promise<string | null>;
    load(): Promise<string | null>;
    getMirror(): Promise<string | null>;
    chooseMirror(): Promise<string | null>;
    clearMirror(): Promise<boolean>;
  };
  files: {
    savePdf(html: string, name: string): Promise<string>;
    reveal(file: string): Promise<boolean>;
    exportLog(text: string): Promise<string>;
    saveText(text: string, name: string, ext: "csv" | "txt" | "json"): Promise<string>;
  };
  radio: {
    get(): Promise<{ ok: boolean; radios: { kind: "Bluetooth" | "WiFi"; state: string }[]; error?: string }>;
    set(kind: "Bluetooth" | "WiFi", on: boolean): Promise<{ ok: boolean; radios: { kind: "Bluetooth" | "WiFi"; state: string }[]; error?: string }>;
  };
  apps: {
    list(): Promise<{ id: string; title: string; purpose: string; size: string; hasChecksum: boolean; downloaded: boolean; file: string | null }[]>;
    download(id: string): Promise<{ ok: true; file: string; sha256: string; verified: boolean } | { ok: false; error: string }>;
    choose(file: string): Promise<string | null>;
    openFolder(): Promise<string>;
  };
  finder: {
    search(query: string): Promise<{ ok: boolean; results: { title: string; url: string; snippet: string }[]; error?: string }>;
    openUrl(url: string): Promise<boolean>;
    download(url: string): Promise<{ ok: true; item: QuarantineItem } | { ok: false; error: string }>;
    list(): Promise<QuarantineItem[]>;
    remove(id: string): Promise<boolean>;
    readText(id: string): Promise<string | null>;
    accept(id: string): Promise<{ ok: true; kind: "apk"; dest: string } | { ok: true; kind: "package"; text: string; id: string } | { ok: false; error: string }>;
    addLocalForTest(file: string): Promise<{ ok: boolean; item?: QuarantineItem; error?: string }>;
  };
  fwbackup: {
    save(data: { vin: string; ecuName: string; txId: string; software: string; pkgId: string; pkgVersion: string; dataBase64: string }): Promise<FirmwareBackupMeta>;
    list(vin?: string): Promise<FirmwareBackupMeta[]>;
    read(id: string, vin: string): Promise<{ ok: true; meta: FirmwareBackupMeta; dataBase64: string } | { ok: false; error: string }>;
    openFolder(vin: string): Promise<string>;
  };
  update: {
    check(): Promise<{ ok: boolean; current: string; latest?: string | null; newer?: boolean; url?: string; downloadUrl?: string | null; notes?: string; error?: string }>;
    open(url: string): Promise<boolean>;
  };
  j2534: { list(): Promise<{ name: string; vendor: string }[]> };
  usb: {
    drives(): Promise<{ letter: string; label: string; fileSystem: string; size: number; free: number }[]>;
    pickFile(): Promise<{ name: string; size: number } | null>;
    copy(letter: string): Promise<{ ok: true; dest: string; sha256: string } | { ok: false; error: string }>;
    setFileForTest(file: string): Promise<boolean>;
  };
  bluetooth: {
    sendFile(file: string): Promise<{ ok: boolean; error?: string }>;
    openSettings(): Promise<void>;
  };
  net: { scan(): Promise<{ ip: string; port: number }[]> };
  adb: {
    run(args: { op: "version" | "devices" | "connect" | "disconnect" | "packages" | "install" | "uninstall" | "reboot" | "locale" | "settings" | "props"; serial?: string; address?: string; pkg?: string }): Promise<{ ok: boolean; out: string }>;
    pickApk(): Promise<string | null>;
    setApkForTest(file: string): Promise<boolean>;
  };
  chooser: {
    onList(cb: (payload: { kind: ChooserKind; devices: ChooserDevice[] }) => void): () => void;
    pick(kind: ChooserKind, id: string | null): void;
  };
};

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { autoflash?: DesktopBridge }).autoflash;
  return b?.desktop ? b : null;
}
