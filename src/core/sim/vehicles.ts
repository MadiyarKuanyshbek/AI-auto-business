import type { SimVehicle } from "./simulator";

// Демо-автомобили. Номера блоков и ПО ВЫМЫШЛЕННЫЕ — они повторяют формат реальных,
// но не относятся к конкретным авто. Нужны, чтобы показать работу приложения без машины.

const COMMON_PIDS = {
  0x05: [0x5f], // ОЖ 55 °C
  0x0b: [0x23], // MAP 35 кПа
  0x0c: [0x0c, 0x80], // 800 об/мин
  0x0d: [0x00],
  0x0f: [0x41], // впуск 25 °C
  0x11: [0x1c],
  0x33: [0x65], // 101 кПа
  0x42: [0x38, 0x4e], // 14.414 В
};

export const DEMO_VEHICLES: SimVehicle[] = [
  {
    label: "Volkswagen Golf 6 2.0 TDI (демо)",
    vin: "WVWZZZ1KZBW123456",
    voltage: 12.7,
    pids: { ...COMMON_PIDS, 0x04: [0x3a], 0x10: [0x04, 0xd2] },
    calibrationIds: ["03L906018FQ 0258"],
    cvn: ["A1B2C3D4"],
    ecuName: "ECM-EngineControl",
    ecus: [
      {
        name: "Двигатель",
        txId: "7E0",
        rxId: "7E8",
        obd: true,
        dtcs: ["P0299"],
        dids: {
          0xf187: "03L906018FQ",
          0xf189: "0258",
          0xf18a: "Bosch",
          0xf190: "WVWZZZ1KZBW123456",
          0xf191: "03L906018FQ",
          0xf192: "0281016519",
          0xf194: "1037525811",
          0xf195: "1037525811AA",
          0xf197: "EDC17 CP20",
        },
      },
      {
        name: "Коробка передач (DSG)",
        txId: "7E1",
        rxId: "7E9",
        dids: { 0xf187: "02E300057Q", 0xf189: "0721", 0xf18a: "VW", 0xf190: "WVWZZZ1KZBW123456", 0xf197: "DQ250 Mechatronic" },
      },
      {
        name: "ABS/ESP",
        txId: "7E2",
        rxId: "7EA",
        dids: { 0xf187: "1K0907379AE", 0xf189: "0150", 0xf18a: "Continental", 0xf197: "ESP MK60" },
      },
    ],
  },
  {
    label: "BMW 320d F30 (демо)",
    vin: "WBA3D31050K567890",
    voltage: 12.5,
    pids: { ...COMMON_PIDS, 0x04: [0x33], 0x10: [0x03, 0xe8] },
    calibrationIds: ["9L2H2D5A"],
    cvn: ["0E1D2C3B", "55AA66BB"],
    ecuName: "DDE8.0",
    ecus: [
      {
        name: "Двигатель (DDE)",
        txId: "7E0",
        rxId: "7E8",
        obd: true,
        dtcs: [],
        dids: {
          0xf187: "8570315-01",
          0xf189: "9L2H2D5A",
          0xf18a: "Bosch",
          0xf190: "WBA3D31050K567890",
          0xf191: "0281031409",
          0xf194: "1037560226",
          0xf195: "1037560226",
          0xf197: "EDC17C50",
        },
      },
      { name: "Коробка (EGS)", txId: "7E1", rxId: "7E9", dids: { 0xf187: "8631246", 0xf189: "A0B1", 0xf18a: "ZF", 0xf197: "GA8HP" } },
    ],
  },
  {
    label: "Toyota Camry XV70 2.5 (демо)",
    vin: "4T1B11HK5KU012345",
    voltage: 12.4,
    pids: { ...COMMON_PIDS, 0x04: [0x2b], 0x10: [0x02, 0x58] },
    calibrationIds: ["8966306B50"],
    cvn: ["9A8B7C6D"],
    ecuName: "ECM",
    ecus: [
      {
        name: "Двигатель (ECM)",
        txId: "7E0",
        rxId: "7E8",
        obd: true,
        dtcs: ["P0420", "P0171"],
        dids: {
          0xf187: "89663-06B50",
          0xf188: "8966306B50",
          0xf18a: "Denso",
          0xf190: "4T1B11HK5KU012345",
          0xf191: "89661-06B50",
          0xf197: "A25A-FKS ECM",
        },
      },
      { name: "Гибридная система / АКПП", txId: "7E1", rxId: "7E9", dids: { 0xf187: "89560-06A60", 0xf18a: "Denso", 0xf197: "TCM" } },
    ],
  },

  {
    label: "Škoda Octavia 1.9 TDI 2005, K-Line KWP2000 (демо)",
    bus: "kline",
    klineKind: "kwp",
    vin: "TMBDX41U852123456",
    voltage: 12.6,
    pids: { ...COMMON_PIDS, 0x04: [0x30], 0x10: [0x03, 0x20] },
    calibrationIds: ["038906019BQ"],
    cvn: ["11223344"],
    ecuName: "ECM-PD",
    ecus: [
      {
        name: "Двигатель",
        txId: "10",
        rxId: "",
        obd: true,
        dtcs: ["P0101"],
        kwpIdent: {
          0x90: "TMBDX41U852123456",
          0x91: "038906019BQ",
          0x92: "0281011207",
          0x93: "H03",
          0x94: "1037372851",
          0x95: "1037372851",
          0x97: "1.9l R4/2V PD",
          0x99: "2005-03-14",
        },
      },
      { name: "Коробка передач", txId: "18", rxId: "", kwpIdent: { 0x91: "09G927750D", 0x97: "AQ250 Getriebe" } },
    ],
  },
  {
    label: "Toyota Corolla 2001, K-Line ISO 9141-2 (демо)",
    bus: "kline",
    klineKind: "iso9141",
    vin: "JTDBR32E710123456",
    voltage: 12.3,
    pids: { ...COMMON_PIDS, 0x04: [0x28], 0x10: [0x01, 0xf4] },
    calibrationIds: ["89661-02A51"],
    cvn: ["AABBCCDD"],
    ecuName: "ENGINE",
    ecus: [{ name: "Двигатель", txId: "11", rxId: "", obd: true, dtcs: ["P0420"] }],
  },
  {
    label: "Грузовой автомобиль, CAN 29 бит (демо)",
    bus: "can29",
    vin: "YV2RT40A1AB123456",
    voltage: 24.1,
    pids: { ...COMMON_PIDS, 0x04: [0x40], 0x10: [0x09, 0x60] },
    calibrationIds: ["TRK-ECM-4471"],
    cvn: ["01020304"],
    ecuName: "EMS",
    ecus: [
      {
        name: "Двигатель",
        txId: "18DA10F1",
        rxId: "18DAF110",
        obd: true,
        dtcs: [],
        dids: { 0xf187: "21045511", 0xf189: "V7.2", 0xf18a: "Bosch", 0xf190: "YV2RT40A1AB123456", 0xf191: "0281020017", 0xf194: "1037389999", 0xf197: "EDC17CV41" },
      },
      { name: "Коробка передач", txId: "18DA18F1", rxId: "18DAF118", dids: { 0xf187: "85013307", 0xf18a: "ZF", 0xf197: "AS-Tronic" } },
    ],
  },
];
