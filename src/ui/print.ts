import { Platform, Share } from "react-native";

/** Печать или сохранение в PDF: в браузере и настольном приложении — окно печати, на телефоне — отправка текстом. */
export async function printHtml(html: string, fallbackText: string) {
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return;
  }
  await Share.share({ message: fallbackText });
}
