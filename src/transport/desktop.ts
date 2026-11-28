// Мост настольного приложения (desktop/preload.cjs). В браузере и на телефоне его нет.
export type ChooserKind = "bluetooth" | "serial";
export type ChooserDevice = { id: string; name: string };

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
    saveText(text: string, name: string, ext: "csv" | "txt"): Promise<string>;
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
    run(args: { op: "version" | "devices" | "connect" | "disconnect" | "packages" | "install" | "uninstall" | "reboot" | "locale" | "settings"; serial?: string; address?: string; pkg?: string }): Promise<{ ok: boolean; out: string }>;
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
