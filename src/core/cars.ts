// Справочник современных автомобилей (примерно 2010–2026 годы выпуска) для поиска прошивок по модели.
// Это справочник поколений и годов, собранный вручную: он может быть неполным или неточным по годам
// переходов между поколениями, поэтому для точного подбора всегда сверяйтесь с VIN и номером ПО блока.
// Формат строки: "Модель /синоним1,синоним2: годОт-годДо" (пустой годДо = выпускается сейчас).

const CURRENT_YEAR = 2026;

type RawMake = { ru: string[]; models: string[] };

const RAW: Record<string, RawMake> = {
  Toyota: {
    ru: ["тойота"],
    models: [
      "Camry XV50 /камри: 2011-2017", "Camry XV70 /камри: 2017-", "Corolla E170 /королла: 2013-2019", "Corolla E210 /королла: 2018-",
      "Yaris XP130 /ярис: 2011-2020", "Yaris XP210 /ярис: 2020-", "Auris /аурис: 2012-2018", "Avensis T270 /авенсис: 2011-2018",
      "RAV4 XA40 /рав4,рав 4: 2012-2018", "RAV4 XA50 /рав4,рав 4: 2018-", "C-HR /сх р: 2016-", "Highlander XU50 /хайлендер: 2013-2019",
      "Highlander XU70 /хайлендер: 2019-", "Land Cruiser 200 /крузак,ленд крузер,лк 200: 2007-2021", "Land Cruiser 300 /крузак,ленд крузер,лк 300: 2021-",
      "Land Cruiser Prado 150 /прадо: 2009-", "Hilux AN120 /хайлюкс,хайлакс: 2015-2024", "Hilux AN150 /хайлюкс,хайлакс: 2024-", "Fortuner /фортунер: 2015-",
      "Alphard /альфард: 2015-", "Sienna /сиенна: 2010-", "Venza /венза: 2020-", "Prius XW50 /приус: 2015-2022", "Prius XW60 /приус: 2022-",
      "Crown /краун: 2012-", "Camry Hybrid /камри гибрид: 2012-", "Sequoia /секвойя: 2022-", "Tacoma /такома: 2015-", "Tundra /тундра: 2022-",
      "bZ4X: 2022-", "GR86: 2021-", "Supra A90 /супра: 2019-", "Veloz: 2021-", "Rush: 2017-",
    ],
  },
  Lexus: {
    ru: ["лексус"],
    models: [
      "IS XE30 /ис: 2013-2020", "IS XE40: 2020-", "ES XV60 /ес: 2012-2018", "ES XZ10: 2018-", "GS L10 /гс: 2012-2020", "LS XF50 /лс: 2017-",
      "NX AZ10 /нх: 2014-2021", "NX AZ20: 2021-", "RX AL20 /рх: 2015-2022", "RX AL30: 2022-", "GX 460 /гх: 2010-", "GX 550: 2023-",
      "LX 570 /лх: 2007-2021", "LX 600: 2021-", "UX /их: 2018-", "RC /рц: 2014-", "LC 500: 2017-", "LM: 2019-",
    ],
  },
  Hyundai: {
    ru: ["хендай", "хундай", "хёндай", "хьюндай"],
    models: [
      "Solaris HC /солярис: 2017-2023", "Solaris RB /солярис: 2010-2017", "Accent /акцент: 2017-", "Elantra MD /элантра: 2010-2015", "Elantra AD: 2015-2020",
      "Elantra CN7: 2020-", "Sonata YF /соната: 2009-2014", "Sonata LF: 2014-2019", "Sonata DN8: 2019-", "Tucson TL /туссан,таксон: 2015-2020",
      "Tucson NX4: 2020-", "Santa Fe DM /санта фе: 2012-2018", "Santa Fe TM: 2018-2023", "Santa Fe MX5: 2023-", "Creta GS /крета: 2014-2021",
      "Creta SU2: 2021-", "Palisade LX2 /палисад: 2018-", "Kona OS /кона: 2017-2023", "Kona SX2: 2023-", "i30 GD: 2011-2016", "i30 PD: 2016-",
      "i40: 2011-2019", "Grandeur /грандер: 2016-", "Staria /стария: 2021-", "H-1 /х1: 2008-2021", "Venue: 2019-", "Ioniq 5 /ионик: 2021-", "Ioniq 6: 2022-",
      "Genesis G70 /генезис: 2017-", "Genesis G80: 2016-", "Genesis G90: 2016-", "Genesis GV70: 2020-", "Genesis GV80: 2020-",
    ],
  },
  Kia: {
    ru: ["киа", "кия"],
    models: [
      "Rio QB /рио: 2011-2017", "Rio FB: 2017-", "Cerato YD /церато,серато: 2013-2018", "Cerato BD: 2018-", "K5 DL3 /к5: 2019-", "Optima TF /оптима: 2010-2015",
      "Optima JF: 2015-2020", "Sportage SL /спортаж: 2010-2015", "Sportage QL: 2015-2021", "Sportage NQ5: 2021-", "Sorento XM /соренто: 2009-2014",
      "Sorento UM: 2014-2020", "Sorento MQ4: 2020-", "Seltos /селтос: 2019-", "Soul SK3 /соул: 2019-", "Soul PS: 2013-2019", "Carnival KA4 /карнивал: 2020-",
      "Stinger CK /стингер: 2017-", "Picanto JA /пиканто: 2017-", "Mohave /мохаве: 2008-", "Telluride /теллурайд: 2019-", "Niro /ниро: 2016-", "EV6 /ев6: 2021-",
      "K8: 2021-", "K900: 2018-", "Ceed JD /сид: 2012-2018", "Ceed CD: 2018-", "Stonic: 2017-", "Sonet: 2020-",
    ],
  },
  Nissan: {
    ru: ["ниссан"],
    models: [
      "Qashqai J11 /кашкай: 2013-2021", "Qashqai J12: 2021-", "X-Trail T32 /икс трейл,х трейл: 2013-2021", "X-Trail T33: 2021-", "Murano Z52 /мурано: 2014-",
      "Pathfinder R52 /патфайндер: 2012-2021", "Pathfinder R53: 2021-", "Patrol Y62 /патрол: 2010-", "Teana L33 /теана: 2013-2020", "Almera G15 /альмера: 2012-2018",
      "Juke F15 /жук: 2010-2019", "Note: 2012-2020", "Sentra /сентра: 2012-", "Altima L33 /алтима: 2012-", "Leaf ZE1 /лиф: 2017-", "Navara D23 /навара: 2014-2021",
      "Tiida /тиида: 2010-2015", "Kicks: 2016-", "Rogue /рог: 2013-", "GT-R R35 /гт р: 2009-", "Armada /армада: 2016-", "Terra: 2018-",
    ],
  },
  Infiniti: {
    ru: ["инфинити"],
    models: ["Q50 /ку50: 2013-", "Q60: 2013-", "Q70: 2013-2019", "QX50 /кх50: 2018-", "QX60: 2012-", "QX70: 2013-2017", "QX80: 2013-", "FX /фх: 2008-2013"],
  },
  Mazda: {
    ru: ["мазда"],
    models: [
      "Mazda3 BM /мазда 3: 2013-2019", "Mazda3 BP: 2019-", "Mazda6 GJ /мазда 6: 2012-2023", "CX-5 KE /сх5,cx 5: 2012-2017", "CX-5 KF: 2017-", "CX-9 TC /сх9: 2015-2023",
      "CX-30 /сх30: 2019-", "CX-3 /сх3: 2015-", "CX-60 /сх60: 2022-", "CX-50: 2022-", "CX-90: 2023-", "MX-5 ND /мх5: 2015-", "Mazda2 /мазда 2: 2014-",
      "BT-50: 2020-",
    ],
  },
  Mitsubishi: {
    ru: ["митсубиси", "мицубиси", "митсубиши"],
    models: [
      "Outlander GF /аутлендер: 2012-2021", "Outlander GN: 2021-", "ASX /асх: 2010-", "Pajero Sport QE /паджеро спорт: 2015-", "Pajero 4 /паджеро: 2006-2021",
      "L200 KK /л200: 2015-", "Lancer X /лансер: 2007-2017", "Eclipse Cross /эклипс кросс: 2017-", "Xpander: 2017-", "Mirage: 2012-", "Delica: 2019-",
    ],
  },
  Honda: {
    ru: ["хонда"],
    models: [
      "Civic FK /цивик: 2016-2021", "Civic FL: 2021-", "Accord CR /аккорд: 2012-2017", "Accord CV: 2017-", "CR-V RM /црв,срв: 2012-2016", "CR-V RW: 2017-2022",
      "CR-V RS: 2022-", "HR-V RU /хрв: 2014-", "Pilot /пилот: 2015-", "Fit /фит: 2013-2020", "Jazz: 2015-", "Odyssey /одиссей: 2013-", "Freed: 2016-",
      "Vezel: 2013-", "ZR-V: 2022-", "City: 2014-",
    ],
  },
  Subaru: {
    ru: ["субару"],
    models: ["Forester SJ /форестер: 2012-2018", "Forester SK: 2018-", "Outback BR /аутбек: 2009-2014", "Outback BS: 2014-2019", "Outback BT: 2019-", "Impreza GJ /импреза: 2011-2016", "Impreza GK: 2016-", "XV GP /хв: 2012-2017", "Crosstrek: 2017-", "Legacy BN: 2014-2019", "WRX VA: 2014-2021", "WRX VB: 2021-", "BRZ ZD8: 2021-", "Levorg: 2014-", "Ascent: 2018-"],
  },
  Suzuki: {
    ru: ["сузуки"],
    models: ["Vitara LY /витара: 2015-", "SX4 S-Cross: 2013-", "Jimny JB74 /джимни: 2018-", "Swift /свифт: 2017-", "Baleno: 2015-", "Ignis: 2016-", "Grand Vitara /гранд витара: 2005-2015", "Ertiga: 2018-", "Dzire: 2017-"],
  },
  Volkswagen: {
    ru: ["фольксваген", "вольцваген", "фольц", "вв"],
    models: [
      "Golf Mk6 /гольф 6: 2008-2012", "Golf Mk7 /гольф 7: 2012-2019", "Golf Mk8 /гольф 8: 2019-", "Polo Mk5 /поло: 2009-2017", "Polo Sedan RUS /поло седан: 2010-2020",
      "Polo Mk6: 2017-", "Passat B7 /пассат: 2010-2014", "Passat B8: 2014-", "Jetta Mk6 /джетта: 2010-2018", "Jetta Mk7: 2018-", "Tiguan 5N /тигуан: 2007-2016",
      "Tiguan AD1: 2016-2023", "Tiguan: 2023-", "Touareg 7P /туарег: 2010-2018", "Touareg CR7: 2018-", "Teramont /терамонт,атлас: 2017-", "T-Roc: 2017-",
      "T-Cross: 2018-", "Caddy: 2010-", "Transporter T6 /транспортер: 2015-2019", "Transporter T6.1: 2019-", "Multivan T6: 2015-", "Amarok /амарок: 2010-2022",
      "Arteon: 2017-", "ID.4: 2020-", "ID.3: 2019-", "Taos: 2021-", "Scirocco: 2008-2017", "Touran: 2010-", "Sharan: 2010-",
    ],
  },
  Audi: {
    ru: ["ауди"],
    models: [
      "A3 8V /а3: 2012-2020", "A3 8Y: 2020-", "A4 B8 /а4: 2007-2015", "A4 B9: 2015-", "A5 8T /а5: 2007-2016", "A5 F5: 2016-", "A6 C7 /а6: 2011-2018", "A6 C8: 2018-",
      "A7 4G /а7: 2010-2018", "A7 4K: 2017-", "A8 D4 /а8: 2010-2017", "A8 D5: 2017-", "Q2: 2016-", "Q3 8U /ку3: 2011-2018", "Q3 F3: 2018-", "Q5 8R /ку5: 2008-2017",
      "Q5 FY: 2017-", "Q7 4L /ку7: 2005-2015", "Q7 4M: 2015-", "Q8 /ку8: 2018-", "TT 8S /тт: 2014-", "R8: 2015-", "e-tron /етрон: 2018-", "RS6 /рс6: 2013-", "RS3: 2017-",
      "S3: 2013-", "S4: 2015-", "S5: 2016-",
    ],
  },
  Skoda: {
    ru: ["шкода"],
    models: [
      "Octavia A5 /октавия: 2004-2013", "Octavia A7: 2012-2020", "Octavia A8: 2019-", "Rapid /рапид: 2012-2020", "Superb B6 /суперб: 2008-2015", "Superb B8: 2015-",
      "Kodiaq /кодиак: 2016-", "Karoq /карок: 2017-", "Kamiq: 2019-", "Fabia III /фабия: 2014-", "Yeti /йети: 2009-2017", "Scala: 2019-", "Enyaq: 2020-", "Roomster: 2006-2015",
    ],
  },
  SEAT: {
    ru: ["сеат"],
    models: ["Leon 5F /леон: 2012-2020", "Leon KL: 2020-", "Ibiza 6J /ибица: 2008-2017", "Ibiza KJ: 2017-", "Ateca: 2016-", "Arona: 2017-", "Tarraco: 2018-", "Alhambra: 2010-2020"],
  },
  Cupra: { ru: ["купра"], models: ["Formentor: 2020-", "Born: 2021-", "Leon: 2020-", "Ateca: 2018-"] },
  BMW: {
    ru: ["бмв", "бэмвэ", "бумер"],
    models: [
      "1 Series F20 /1 серия: 2011-2019", "1 Series F40: 2019-", "2 Series F22: 2013-2021", "2 Series G42: 2021-", "3 Series F30 /3 серия,тройка: 2011-2019", "3 Series G20: 2018-",
      "4 Series F32: 2013-2020", "4 Series G22: 2020-", "5 Series F10 /5 серия,пятерка: 2009-2016", "5 Series G30: 2016-2023", "5 Series G60: 2023-", "6 Series F06: 2011-2018",
      "7 Series F01 /7 серия: 2008-2015", "7 Series G11: 2015-2022", "7 Series G70: 2022-", "8 Series G15: 2018-", "X1 F48 /х1: 2015-2022", "X1 U11: 2022-", "X2: 2017-",
      "X3 F25 /х3: 2010-2017", "X3 G01: 2017-2024", "X3 G45: 2024-", "X4: 2014-", "X5 F15 /х5: 2013-2018", "X5 G05: 2018-", "X6 F16 /х6: 2014-2019", "X6 G06: 2019-",
      "X7 G07 /х7: 2018-", "Z4 G29: 2018-", "M2: 2015-", "M3: 2014-", "M4: 2014-", "M5 F90: 2017-", "i3: 2013-2022", "i4: 2021-", "iX: 2021-", "iX3: 2020-",
    ],
  },
  "Mercedes-Benz": {
    ru: ["мерседес", "мерс", "мерен"],
    models: [
      "A-Class W176 /а класс: 2012-2018", "A-Class W177: 2018-", "B-Class W246: 2011-2018", "C-Class W204 /ц класс,с класс: 2007-2014", "C-Class W205: 2014-2021", "C-Class W206: 2021-",
      "CLA C117: 2013-2019", "CLA C118: 2019-", "E-Class W212 /е класс: 2009-2016", "E-Class W213: 2016-2023", "E-Class W214: 2023-", "S-Class W221 /с класс: 2005-2013",
      "S-Class W222: 2013-2020", "S-Class W223: 2020-", "GLA X156: 2013-2020", "GLA H247: 2020-", "GLB: 2019-", "GLC X253 /глц: 2015-2022", "GLC X254: 2022-",
      "GLE W166 /глс: 2011-2019", "GLE W167: 2019-", "GLS X166 /глс: 2012-2019", "GLS X167: 2019-", "G-Class W463 /гелик,гелендваген,джи класс: 2018-", "G-Class W463 old: 2000-2018",
      "ML W166: 2011-2015", "GL X166: 2012-2015", "V-Class W447 /в класс: 2014-", "Vito W447: 2014-", "Sprinter W907 /спринтер: 2018-", "Sprinter W906: 2006-2018",
      "CLS C257: 2018-", "AMG GT: 2014-", "EQC: 2019-", "EQE: 2021-", "EQS: 2021-", "SLK/SLC: 2011-2020", "Maybach S-Class: 2014-",
    ],
  },
  Opel: {
    ru: ["опель"],
    models: ["Astra J /астра: 2009-2015", "Astra K: 2015-2021", "Astra L: 2021-", "Insignia A /инсигния: 2008-2017", "Insignia B: 2017-", "Corsa D /корса: 2006-2014", "Corsa E: 2014-2019", "Corsa F: 2019-", "Mokka /мокка: 2012-", "Zafira C /зафира: 2011-2019", "Meriva: 2010-2017", "Vivaro: 2014-", "Grandland: 2017-", "Crossland: 2017-"],
  },
  Ford: {
    ru: ["форд"],
    models: [
      "Focus Mk3 /фокус: 2010-2018", "Focus Mk4: 2018-2025", "Fiesta Mk7 /фиеста: 2008-2017", "Fiesta Mk8: 2017-2023", "Mondeo Mk5 /мондео: 2014-2022", "Kuga Mk2 /куга: 2012-2019",
      "Kuga Mk3: 2019-", "Explorer U502 /эксплорер: 2019-", "Explorer U502 old: 2010-2019", "EcoSport /экоспорт: 2012-", "Ranger T6 /рейнджер: 2011-2022", "Ranger T9: 2022-", "F-150 /ф150: 2015-",
      "Mustang S550 /мустанг: 2014-2023", "Mustang S650: 2023-", "Transit Mk8 /транзит: 2014-", "Edge: 2015-", "Escape: 2019-", "Bronco: 2020-", "Puma: 2019-", "Tourneo Custom: 2012-",
    ],
  },
  Chevrolet: {
    ru: ["шевроле", "шеви"],
    models: ["Cobalt /кобальт: 2011-2024", "Nexia R3 /нексия: 2015-", "Lacetti /лачетти: 2004-2013", "Aveo T300 /авео: 2011-2015", "Cruze J300 /круз: 2009-2016", "Cruze: 2016-2019", "Malibu /малибу: 2012-2022", "Captiva /каптива: 2011-2018",
      "Tahoe /тахо: 2014-2020", "Tahoe: 2020-", "Suburban /субурбан: 2015-", "Camaro /камаро: 2015-", "Equinox /эквинокс: 2017-", "Traverse: 2018-", "Silverado /сильверадо: 2018-", "Onix: 2019-", "Spark /спарк: 2015-", "Orlando: 2011-2018", "Trailblazer: 2012-", "Tracker: 2019-"],
  },
  Cadillac: { ru: ["кадиллак"], models: ["Escalade /эскалейд: 2015-2020", "Escalade: 2021-", "XT5: 2017-", "XT4: 2018-", "CT5: 2019-", "CT6: 2016-2020", "ATS: 2012-2019", "CTS: 2014-2019"] },
  Jeep: { ru: ["джип"], models: ["Wrangler JL /вранглер: 2018-", "Wrangler JK: 2007-2018", "Grand Cherokee WK2 /гранд чероки: 2010-2021", "Grand Cherokee WL: 2021-", "Cherokee KL /чероки: 2013-", "Compass /компас: 2017-", "Renegade /ренегат: 2014-", "Gladiator: 2019-", "Grand Wagoneer: 2021-"] },
  Dodge: { ru: ["додж"], models: ["Charger LD /чарджер: 2011-", "Challenger LC /челленджер: 2008-2023", "Durango WD /дуранго: 2011-", "RAM 1500 /рам: 2018-", "Journey /джорни: 2008-2020"] },
  Chrysler: { ru: ["крайслер"], models: ["300C LX /300с: 2011-2023", "Pacifica /пацифика: 2016-", "Voyager: 2017-"] },
  Tesla: { ru: ["тесла"], models: ["Model 3 /модель 3: 2017-", "Model S /модель с: 2012-", "Model X /модель х: 2015-", "Model Y /модель у: 2020-", "Cybertruck: 2023-"] },
  Renault: {
    ru: ["рено"],
    models: ["Logan II /логан: 2014-", "Sandero II /сандеро: 2014-", "Duster I /дастер: 2010-2021", "Duster II: 2021-", "Kaptur /каптур: 2016-", "Arkana /аркана: 2019-", "Megane III /меган: 2008-2016", "Megane IV: 2016-", "Clio IV /клио: 2012-2019", "Clio V: 2019-",
      "Captur: 2013-", "Koleos II /колеос: 2016-", "Fluence /флюенс: 2009-2016", "Kadjar /каджар: 2015-", "Master /мастер: 2010-", "Trafic: 2014-", "Zoe: 2012-", "Dokker: 2012-", "Lodgy: 2012-"],
  },
  Peugeot: { ru: ["пежо"], models: ["208 /208: 2012-2019", "208: 2019-", "308 T9: 2013-2021", "308 P5: 2021-", "408: 2022-", "508 R8: 2011-2018", "508 R82: 2018-", "2008: 2013-", "3008 T8: 2016-2023", "5008: 2017-", "Partner /партнер: 2008-", "Expert: 2016-", "Boxer: 2014-", "Traveller: 2016-"] },
  Citroen: { ru: ["ситроен"], models: ["C3: 2016-", "C4 B7 /с4: 2010-2018", "C4: 2020-", "C5 Aircross: 2018-", "C3 Aircross: 2017-", "Berlingo /берлинго: 2018-", "Jumpy /джампи: 2016-", "Jumper: 2014-", "C-Elysee /с элизе: 2012-"] },
  Volvo: { ru: ["вольво"], models: ["XC90 /хс90: 2015-", "XC60 /хс60: 2017-", "XC40 /хс40: 2017-", "S90 /с90: 2016-", "S60 /с60: 2018-", "V60 /в60: 2018-", "V90: 2016-", "C40: 2021-", "XC60 old: 2008-2017"] },
  "Land Rover": { ru: ["ленд ровер", "лэнд ровер", "рендж ровер", "ленд"], models: ["Range Rover L405 /рендж ровер: 2012-2021", "Range Rover L460: 2021-", "Range Rover Sport L494 /рендж ровер спорт: 2013-2022", "Range Rover Sport L461: 2022-", "Range Rover Velar /велар: 2017-", "Range Rover Evoque L538 /эвок: 2011-2019", "Range Rover Evoque L551: 2019-", "Discovery 4 /дискавери: 2009-2016", "Discovery 5: 2016-", "Discovery Sport /дискавери спорт: 2014-", "Defender L663 /дефендер: 2019-", "Freelander 2: 2006-2014"] },
  Jaguar: { ru: ["ягуар"], models: ["XE: 2015-", "XF X260 /хф: 2015-", "XJ X351: 2010-2019", "F-Pace /ф пейс: 2016-", "E-Pace: 2017-", "F-Type: 2013-", "I-Pace: 2018-"] },
  Porsche: { ru: ["порше", "порш"], models: ["Cayenne 958 /кайен: 2010-2017", "Cayenne 9Y0: 2017-", "Macan /макан: 2014-", "Panamera 970 /панамера: 2009-2016", "Panamera 971: 2016-", "911 991 /911: 2011-2019", "911 992: 2019-", "Taycan /тайкан: 2019-", "718 Cayman/Boxster: 2016-"] },
  Mini: { ru: ["мини"], models: ["Cooper F56 /купер: 2013-", "Countryman F60 /кантримен: 2016-", "Clubman F54: 2015-", "Cooper R56: 2006-2013", "Countryman R60: 2010-2016"] },
  Lada: {
    ru: ["лада", "ваз"],
    models: ["Granta /гранта: 2011-", "Vesta /веста: 2015-", "Niva Legend /нива: 1977-", "Niva Travel /нива тревел: 2020-", "Largus /ларгус: 2012-", "Priora /приора: 2007-2018", "Kalina /калина: 2004-2018", "XRAY /иксрей: 2015-2022", "Samara/2114: 2001-2013", "Aura: 2024-"],
  },
  UAZ: { ru: ["уаз"], models: ["Patriot /патриот: 2005-", "Hunter /хантер: 2003-", "Profi /профи: 2017-", "Pickup /пикап: 2008-"] },
  GAZ: { ru: ["газ"], models: ["Gazelle Next /газель некст: 2013-", "Gazelle Business /газель бизнес: 2010-", "Sobol /соболь: 2010-", "Valdai: 2012-"] },
  Chery: { ru: ["чери", "чэри"], models: ["Tiggo 4 /тигго: 2018-", "Tiggo 7 Pro /тигго 7: 2020-", "Tiggo 8 /тигго 8: 2018-", "Tiggo 8 Pro: 2021-", "Arrizo 6 /аризо: 2016-", "Arrizo 8: 2022-", "Omoda C5: 2022-", "Exeed TXL: 2019-", "Exeed VX: 2021-", "Exeed LX: 2020-"] },
  Geely: { ru: ["джили", "гели"], models: ["Coolray /кулрей: 2018-", "Atlas /атлас: 2016-", "Atlas Pro: 2021-", "Tugella /тугелла: 2019-", "Monjaro /монджаро: 2021-", "Emgrand /эмгранд: 2016-", "Okavango: 2020-", "Preface: 2020-", "Geometry C: 2020-", "Starray: 2022-"] },
  GAC: { ru: ["гак", "джи эй си", "трумпчи"], models: ["Empow /эмпоу: 2021-", "GS3 /жс3: 2017-", "GS4 /жс4: 2016-", "GS5: 2018-", "GS8 /жс8: 2017-", "GS8 II: 2022-", "M6 /м6: 2018-", "M8 /м8: 2019-", "GA6: 2018-", "GA8: 2019-", "Aion S: 2019-", "Aion Y: 2021-"] },
  Haval: { ru: ["хавейл", "хавал"], models: ["Jolion /джолион: 2020-", "F7 /ф7: 2018-", "F7x: 2019-", "H6 /аш6: 2017-", "H9 /аш9: 2014-", "Dargo /дарго: 2021-", "M6: 2022-", "Big Dog: 2022-"] },
  "Great Wall": { ru: ["грейт волл", "грейт вол"], models: ["Poer /поер: 2019-", "Wingle /вингл: 2006-", "Hover H5: 2010-", "Hover H3: 2010-"] },
  Changan: { ru: ["чанган"], models: ["CS35 Plus /цс35: 2018-", "CS55 Plus: 2019-", "CS75 Plus /цс75: 2019-", "UNI-K: 2020-", "UNI-T: 2020-", "UNI-V: 2021-", "Alsvin: 2018-", "Eado Plus: 2018-"] },
  BYD: { ru: ["бид", "бйд", "бюд"], models: ["Song Plus /сонг: 2020-", "Han /хан: 2020-", "Tang /танг: 2015-", "Seal /сил: 2022-", "Atto 3: 2022-", "Dolphin: 2021-", "Qin Plus: 2018-", "Yuan Plus: 2022-"] },
  Exeed: { ru: ["эксид"], models: ["TXL: 2019-", "VX: 2021-", "LX: 2020-", "RX: 2023-"] },
  Omoda: { ru: ["омода"], models: ["C5: 2022-", "S5: 2023-"] },
  Jetour: { ru: ["джетур"], models: ["X70 /х70: 2018-", "X90 Plus: 2021-", "Dashing: 2022-", "T2: 2023-"] },
  Li: { ru: ["лисян", "li auto"], models: ["L9: 2022-", "L8: 2022-", "L7: 2023-", "Mega: 2024-"] },
  Zeekr: { ru: ["зикр"], models: ["001: 2021-", "007: 2023-", "X: 2023-"] },
  Lifan: { ru: ["лифан"], models: ["X60 /х60: 2011-", "Solano: 2008-", "X50: 2015-", "Myway: 2016-"] },
  Daewoo: { ru: ["дэу", "дево"], models: ["Nexia /нексия: 2008-2016", "Matiz /матиз: 2000-2015", "Gentra: 2013-", "Lanos /ланос: 1997-2008", "Damas /дамас: 2000-"] },
  Ravon: { ru: ["равон"], models: ["R2: 2016-", "R3 Nexia: 2016-", "R4: 2016-", "Gentra: 2015-"] },
  SsangYong: { ru: ["ссангйонг", "санг йонг", "ссанг йонг"], models: ["Rexton G4 /рекстон: 2017-", "Actyon /актион: 2013-", "Tivoli: 2015-", "Korando /корандо: 2019-", "Musso: 2018-", "Kyron: 2005-2015"] },
  Isuzu: { ru: ["исузу"], models: ["D-Max /д макс: 2012-", "MU-X: 2013-", "NQR: 2008-", "Elf: 2008-"] },
  Fiat: { ru: ["фиат"], models: ["500: 2007-", "Tipo: 2016-", "Ducato /дукато: 2014-", "Doblo: 2010-", "Panda: 2011-", "500X: 2014-"] },
  "Alfa Romeo": { ru: ["альфа ромео"], models: ["Giulia: 2015-", "Stelvio: 2016-", "Giulietta: 2010-2020", "Tonale: 2022-"] },
  Maserati: { ru: ["мазерати"], models: ["Ghibli: 2013-", "Levante: 2016-", "Quattroporte: 2013-", "Grecale: 2022-", "MC20: 2020-"] },
  Bentley: { ru: ["бентли"], models: ["Continental GT: 2011-", "Bentayga: 2015-", "Flying Spur: 2013-"] },
  "Rolls-Royce": { ru: ["роллс ройс"], models: ["Ghost: 2010-", "Wraith: 2013-2023", "Cullinan: 2018-", "Phantom: 2017-", "Spectre: 2023-"] },
  Lamborghini: { ru: ["ламборгини"], models: ["Urus: 2018-", "Huracan: 2014-2024", "Aventador: 2011-2022", "Revuelto: 2023-"] },
  Ferrari: { ru: ["феррари"], models: ["488: 2015-2019", "F8 Tributo: 2019-2023", "Roma: 2020-", "812: 2017-", "Purosangue: 2022-"] },
  "Aston Martin": { ru: ["астон мартин"], models: ["DB11: 2016-", "Vantage: 2018-", "DBX: 2020-", "DBS: 2018-"] },
  Smart: { ru: ["смарт"], models: ["Fortwo: 2014-", "Forfour: 2014-2020"] },
  Genesis: { ru: ["дженезис", "генезис"], models: ["G70: 2017-", "G80: 2016-", "G90: 2016-", "GV70: 2020-", "GV80: 2020-"] },
  Hongqi: { ru: ["хунцы", "хончи"], models: ["H5: 2018-", "H9: 2020-", "HS5: 2019-", "E-HS9: 2020-"] },
  Tank: { ru: ["танк"], models: ["300: 2020-", "500: 2021-"] },
  Kaiyi: { ru: ["кайи"], models: ["X3: 2022-", "E5: 2023-"] },
  Foton: { ru: ["фотон"], models: ["Tunland: 2012-", "Sauvana: 2016-"] },
  JAC: { ru: ["джак", "жак"], models: ["S3: 2014-", "S5: 2013-", "J7: 2020-", "T6: 2015-", "T8: 2018-"] },
  FAW: { ru: ["фав"], models: ["Bestune T77: 2018-", "Bestune B70: 2019-", "Besturn X80: 2013-"] },
  DongFeng: { ru: ["донгфенг", "дунфэн"], models: ["AX7: 2015-", "580: 2017-", "T5 EVO: 2018-"] },
};

export type Car = {
  id: string;
  make: string;
  model: string;
  /** Год начала выпуска. */
  from: number;
  /** Год окончания (null — выпускается сейчас). */
  to: number | null;
  aliases: string[];
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function parse(): { cars: Car[]; makeAliases: Map<string, string[]> } {
  const cars: Car[] = [];
  const makeAliases = new Map<string, string[]>();
  for (const [make, raw] of Object.entries(RAW)) {
    makeAliases.set(make, raw.ru.map(norm));
    raw.models.forEach((entry, i) => {
      const colon = entry.lastIndexOf(":");
      const left = colon >= 0 ? entry.slice(0, colon) : entry;
      const years = colon >= 0 ? entry.slice(colon + 1).trim() : "";
      const [name, aka] = left.split(" /");
      const [fromText, toText] = years.split("-").map((v) => v.trim());
      const from = Number(fromText) || 2010;
      const to = toText ? Number(toText) : null;
      cars.push({
        id: `${make}-${i}`,
        make,
        model: name.trim(),
        from,
        to,
        aliases: (aka ?? "").split(",").map(norm).filter(Boolean),
      });
    });
  }
  // Прозвища ("камри", "крузак") относятся ко всем поколениям модели: переносим их на записи без своих.
  const baseOf = (name: string) => {
    const parts = name.split(" ");
    const last = parts[parts.length - 1];
    return parts.length > 1 && last.length >= 2 && /\d/.test(last) ? parts.slice(0, -1).join(" ") : name;
  };
  const shared = new Map<string, Set<string>>();
  for (const c of cars) {
    const key = `${c.make}|${baseOf(c.model)}`;
    if (c.aliases.length) shared.set(key, new Set([...(shared.get(key) ?? []), ...c.aliases]));
  }
  for (const c of cars) {
    if (!c.aliases.length) c.aliases = [...(shared.get(`${c.make}|${baseOf(c.model)}`) ?? [])];
  }
  return { cars, makeAliases };
}

const DB = parse();

export const ALL_CARS: readonly Car[] = DB.cars;
export const ALL_MAKES: readonly string[] = Object.keys(RAW);

export function carYears(car: Car): string {
  return `${car.from}–${car.to ?? "н.в."}`;
}

export function carsOfMake(make: string): Car[] {
  return DB.cars.filter((c) => c.make === make);
}

/**
 * Поиск по марке, модели, поколению и году: "камри 2019", "bmw x5", "g30", "прадо".
 * Понимает русские названия марок и частые прозвища моделей.
 */
export function searchCars(query: string, limit = 80): Car[] {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const year = tokens.map(Number).find((n) => Number.isInteger(n) && n >= 1990 && n <= CURRENT_YEAR + 1);
  const words = tokens.filter((t) => !(Number(t) === year));

  const scored: { car: Car; score: number }[] = [];
  for (const car of DB.cars) {
    if (year && (car.from > year || (car.to ?? CURRENT_YEAR) < year)) continue;
    const makeNames = [norm(car.make), ...(DB.makeAliases.get(car.make) ?? [])];
    const modelText = norm(car.model);
    const modelNames = [modelText, ...car.aliases];
    let score = 0;
    let ok = true;
    for (const w of words) {
      const inMake = makeNames.some((m) => m.startsWith(w) || (w.length >= 3 && m.includes(w)));
      const inModel = modelNames.some((m) => m.split(" ").some((p) => p.startsWith(w)) || (w.length >= 3 && m.includes(w)));
      if (inMake) score += makeNames.some((m) => m.startsWith(w)) ? 3 : 1;
      else if (inModel) score += modelNames.some((m) => m.split(" ").some((p) => p === w)) ? 4 : 2;
      else {
        ok = false;
        break;
      }
    }
    // Бонус, если несколько слов запроса подряд встречаются в названии ("е класс", "x5 g05").
    const rest = words.filter((w) => !makeNames.some((m) => m.startsWith(w))).join(" ");
    if (rest.includes(" ") && modelNames.some((m) => m.includes(rest))) score += 6;
    if (ok && words.length) scored.push({ car, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.car.from - a.car.from)
    .slice(0, limit)
    .map((s) => s.car);
}

/** Находит записи справочника, соответствующие определённому по VIN авто (марка, модель, год). */
export function matchScannedCar(make?: string, model?: string, year?: number): Car[] {
  if (!make) return [];
  const m = norm(make);
  const cand = DB.cars.filter((c) => {
    const names = [norm(c.make), ...(DB.makeAliases.get(c.make) ?? [])];
    return names.some((n) => n === m || m.includes(n) || n.includes(m));
  });
  const byYear = year ? cand.filter((c) => c.from <= year && (c.to ?? CURRENT_YEAR) >= year) : cand;
  const pool = byYear.length ? byYear : cand;
  if (!model) return pool;
  const mm = norm(model);
  const named = pool.filter((c) => norm(c.model).includes(mm) || mm.includes(norm(c.model).split(" ")[0]));
  return named.length ? named : pool;
}
