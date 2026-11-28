import type { CodingPackage } from "../coding";

// Демонстрационный пакет кодирования для ВИРТУАЛЬНОЙ коробки демо-Golf. Какие биты за что отвечают, здесь придумано:
// настоящие карты настроек блоков берутся только из проверенных источников (производитель, тюнер, документация).
export const DEMO_CODING_DSG: CodingPackage = {
  format: "autoflash-coding",
  version: 1,
  id: "demo-golf-dsg-coding",
  title: "Демо: настройки коробки DSG",
  description: "Пример кодирования: меняет параметры виртуальной коробки. Данные ненастоящие, в реальный блок ставиться не должен.",
  target: {
    txId: "7E1",
    did: 0x0600,
    length: 4,
    softwareNumbers: ["02E300057Q"],
    vehicles: [{ make: "Volkswagen", model: "Golf", from: 2008, to: 2012 }],
  },
  session: 0x03,
  security: { level: 0x03, algorithm: "demo-xor-add", params: { maskHex: "21" } },
  options: [
    { id: "sport-default", title: "Спортивный режим после запуска", description: "Коробка после запуска двигателя сразу работает в спортивном режиме: позднее переключение, быстрее реакция.", changes: [{ byte: 0, mask: 0x02, value: 0x02 }] },
    { id: "gear-hint", title: "Подсказка передачи на панели", description: "На панели приборов появляется подсказка, на какую передачу лучше переключиться.", changes: [{ byte: 2, mask: 0x10, value: 0x10 }] },
    { id: "hill-hold", title: "Удержание на подъёме", description: "Машина не откатывается назад на подъёме при переносе ноги с тормоза.", changes: [{ byte: 1, mask: 0x01, value: 0x01 }] },
  ],
  roadLegal: true,
  demo: true,
};
