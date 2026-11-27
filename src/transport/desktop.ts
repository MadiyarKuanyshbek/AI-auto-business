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
  };
  radio: {
    get(): Promise<{ ok: boolean; radios: { kind: "Bluetooth" | "WiFi"; state: string }[]; error?: string }>;
    set(kind: "Bluetooth" | "WiFi", on: boolean): Promise<{ ok: boolean; radios: { kind: "Bluetooth" | "WiFi"; state: string }[]; error?: string }>;
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
