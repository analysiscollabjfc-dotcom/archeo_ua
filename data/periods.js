/*
 * Archaeological periods of Ukraine (simplified, broad date ranges).
 * Years: negative = BCE, positive = CE. Dates follow common Ukrainian
 * periodisation and are approximate; regional cultures overlap.
 */
window.AR_PERIODS = [
  { id: "lpal", name: "Lower & Middle Palaeolithic", name_uk: "Ранній і середній палеоліт", from: -1200000, to: -40000, color: "#6d4c41",
    cultures: "Acheulean, Mousterian (Korolevo, Molodova)", types: ["settlement", "findspot"] },
  { id: "upal", name: "Upper Palaeolithic", name_uk: "Пізній палеоліт", from: -40000, to: -10000, color: "#8d6e63",
    cultures: "Gravettian, Epigravettian; mammoth-bone dwellings (Mezhyrich, Mizyn)", types: ["settlement", "findspot"] },
  { id: "meso", name: "Mesolithic", name_uk: "Мезоліт", from: -10000, to: -6500, color: "#a1887f",
    cultures: "Kukrek, Hrebeniky; Dnipro Rapids cemeteries", types: ["settlement", "burial"] },
  { id: "neo", name: "Neolithic", name_uk: "Неоліт", from: -6500, to: -4500, color: "#7cb342",
    cultures: "Bug-Dniester, Surskyi, Dnipro-Donets, Linear Pottery (west)", types: ["settlement", "burial"] },
  { id: "eneo", name: "Eneolithic (Copper Age), incl. Trypillia", name_uk: "Енеоліт (Трипілля)", from: -5400, to: -2750, color: "#e53935",
    cultures: "Trypillia–Cucuteni, Sredny Stog, Usatove; Trypillia mega-sites", types: ["settlement", "barrow", "burial"] },
  { id: "bronze", name: "Bronze Age", name_uk: "Бронзова доба", from: -3300, to: -900, color: "#fb8c00",
    cultures: "Yamna (Pit-Grave), Catacomb, Multi-cordoned Ware, Srubna, Sabatynivka, Komariv", types: ["barrow", "settlement", "hoard"] },
  { id: "eiron", name: "Early Iron Age: Cimmerians & Scythians", name_uk: "Ранній залізний вік: кіммерійці, скіфи", from: -900, to: -200, color: "#fdd835",
    cultures: "Chornohorivka, Novocherkassk, Scythian; forest-steppe hillforts (Bilsk)", types: ["barrow", "hillfort", "settlement"] },
  { id: "antiq", name: "Greek colonies & Antiquity", name_uk: "Античність (грецькі колонії)", from: -650, to: 400, color: "#26a69a",
    cultures: "Olbia, Tyras, Berezan, Chersonesus, Bosporan Kingdom", types: ["city", "settlement", "burial"] },
  { id: "sarm", name: "Sarmatian & Late Iron Age", name_uk: "Сарматський час, пізній залізний вік", from: -300, to: 300, color: "#29b6f6",
    cultures: "Sarmatians, Late Scythians, Zarubyntsi, Przeworsk", types: ["barrow", "settlement"] },
  { id: "chern", name: "Roman period (Chernyakhiv)", name_uk: "Римський час (черняхівська культура)", from: 150, to: 450, color: "#5c6bc0",
    cultures: "Chernyakhiv (Gothic-era), Kyiv culture, Wielbark", types: ["settlement", "burial", "workshop"] },
  { id: "eslav", name: "Early Medieval (Early Slavs, nomads)", name_uk: "Ранне середньовіччя (ранні слов'яни)", from: 450, to: 880, color: "#7e57c2",
    cultures: "Prague-Korchak, Penkivka, Luka-Raikovetska, Saltovo-Mayaki", types: ["settlement", "hillfort", "burial"] },
  { id: "rus", name: "Kyivan Rus", name_uk: "Київська Русь", from: 880, to: 1240, color: "#ab47bc",
    cultures: "Old Rus towns, hillforts (horodyshche), barrow cemeteries", types: ["hillfort", "city", "barrow", "settlement"] },
  { id: "late_med", name: "Late Medieval (Golden Horde, Lithuania, Poland)", name_uk: "Пізнє середньовіччя", from: 1240, to: 1500, color: "#ec407a",
    cultures: "Golden Horde towns, Galicia-Volhynia, Lithuanian castles", types: ["castle", "settlement", "city"] },
  { id: "cossack", name: "Early Modern (Cossack era)", name_uk: "Ранній новий час (козацька доба)", from: 1500, to: 1800, color: "#8e24aa",
    cultures: "Zaporizhian Sich, Hetmanate towns, fortresses, battlefields", types: ["fortress", "battlefield", "settlement"] },
  { id: "modern", name: "Modern (1800–1945)", name_uk: "Новий і новітній час", from: 1800, to: 1945, color: "#546e7a",
    cultures: "Vanished villages, estates, mills, WWI/WWII sites", types: ["settlement", "battlefield", "industrial"] }
];
