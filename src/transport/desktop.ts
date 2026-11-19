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
