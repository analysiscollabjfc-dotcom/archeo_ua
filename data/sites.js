/*
 * Well-known, published archaeological sites of Ukraine (starter set).
 *
 * Positions are APPROXIMATE (acc = uncertainty radius in km). Replace or
 * extend with your own register via the app's Import button (CSV/GeoJSON),
 * or edit this file. Only widely published sites are included here.
 *
 * type: settlement | barrow | hillfort | city | burial | cave | rockart | fortress | battlefield | workshop
 * periods: ids from data/periods.js
 */
window.AR_SITES = [
  /* ---- Palaeolithic ---- */
  { id: "korolevo", name: "Korolevo", name_uk: "Королеве", lat: 48.15, lon: 23.14, acc: 3, type: "settlement", periods: ["lpal", "upal"],
    notes: "Multi-layer Palaeolithic site in loess–palaeosol sequence on the Tysa; among the oldest in Europe. Deep stratigraphy." },
  { id: "molodova", name: "Molodova I & V", name_uk: "Молодове", lat: 48.36, lon: 27.2, acc: 8, type: "settlement", periods: ["lpal", "upal"],
    notes: "Dniester terrace sites with Mousterian and Upper Palaeolithic horizons; mammoth-bone structure." },
  { id: "mezhyrich", name: "Mezhyrich", name_uk: "Межиріч", lat: 49.7, lon: 31.4, acc: 6, type: "settlement", periods: ["upal"],
    notes: "Mammoth-bone dwellings (Epigravettian), Ros–Rosava confluence area." },
  { id: "mizyn", name: "Mizyn", name_uk: "Мізин", lat: 51.73, lon: 33.05, acc: 10, type: "settlement", periods: ["upal"],
    notes: "Upper Palaeolithic site on the Desna; ornamented mammoth ivory." },
  { id: "pushkari", name: "Pushkari", name_uk: "Пушкарі", lat: 52.0, lon: 33.25, acc: 8, type: "settlement", periods: ["upal"],
    notes: "Upper Palaeolithic sites on the Desna near Novhorod-Siverskyi." },
  { id: "kyrylivska", name: "Kyrylivska site (Kyiv)", name_uk: "Кирилівська стоянка", lat: 50.47, lon: 30.47, acc: 2, type: "settlement", periods: ["upal"],
    notes: "Upper Palaeolithic site in Kyiv, excavated by V. Khvoika (1890s)." },
  { id: "kam_mohyla", name: "Kamiana Mohyla", name_uk: "Кам'яна Могила", lat: 46.93, lon: 35.47, acc: 3, type: "rockart", periods: ["upal", "meso", "neo", "eneo", "bronze"],
    notes: "Sandstone hill with petroglyphs, near Melitopol. Occupied territory." },

  /* ---- Mesolithic / Neolithic ---- */
  { id: "mariupol_cem", name: "Mariupol cemetery", name_uk: "Маріупольський могильник", lat: 47.1, lon: 37.55, acc: 4, type: "burial", periods: ["neo"],
    notes: "Dnipro-Donets culture cemetery. Occupied territory." },
  { id: "vasylivka", name: "Vasylivka cemeteries (Dnipro Rapids)", name_uk: "Василівські могильники", lat: 48.2, lon: 35.1, acc: 15, type: "burial", periods: ["meso", "neo"],
    notes: "Epipalaeolithic–Mesolithic cemeteries; area flooded by the DniproHES reservoir." },
  { id: "surskyi", name: "Surskyi Island", name_uk: "Сурський острів", lat: 48.3, lon: 35.13, acc: 10, type: "settlement", periods: ["neo"],
    notes: "Eponymous Neolithic site of the Surskyi culture; flooded." },

  /* ---- Eneolithic / Trypillia ---- */
  { id: "talianky", name: "Talianky mega-site", name_uk: "Тальянки", lat: 48.79, lon: 30.43, acc: 4, type: "settlement", periods: ["eneo"],
    notes: "Trypillia C1 mega-site, ~300+ ha; mapped by magnetometry." },
  { id: "maidanetske", name: "Maidanetske mega-site", name_uk: "Майданецьке", lat: 48.8, lon: 30.6, acc: 6, type: "settlement", periods: ["eneo"],
    notes: "Trypillia C1 mega-site with concentric house rings." },
  { id: "nebelivka", name: "Nebelivka mega-site", name_uk: "Небелівка", lat: 48.63, lon: 30.55, acc: 6, type: "settlement", periods: ["eneo"],
    notes: "Trypillia B2 mega-site; assembly buildings identified." },
  { id: "trypillia", name: "Trypillia (eponymous)", name_uk: "Трипілля", lat: 50.12, lon: 30.78, acc: 3, type: "settlement", periods: ["eneo"],
    notes: "Eponymous area of V. Khvoika's excavations (1896–)." },
  { id: "verteba", name: "Verteba Cave", name_uk: "Печера Вертеба", lat: 48.78, lon: 25.9, acc: 4, type: "cave", periods: ["eneo"],
    notes: "Gypsum cave with Trypillia ritual deposits and burials (Bilche-Zolote)." },
  { id: "usatove", name: "Usatove", name_uk: "Усатове", lat: 46.53, lon: 30.65, acc: 4, type: "settlement", periods: ["eneo"],
    notes: "Eponymous Late Eneolithic settlement and barrow cemeteries near Odesa." },

  /* ---- Bronze Age ---- */
  { id: "mykhailivka", name: "Mykhailivka settlement", name_uk: "Михайлівське поселення", lat: 47.27, lon: 33.88, acc: 10, type: "settlement", periods: ["eneo", "bronze"],
    notes: "Stratified Eneolithic–Bronze Age settlement on the lower Dnipro (Kherson region)." },
  { id: "storozhova", name: "Storozhova Mohyla", name_uk: "Сторожова Могила", lat: 48.43, lon: 35.03, acc: 8, type: "barrow", periods: ["bronze"],
    notes: "Multi-period barrow near Dnipro; classic Yamna/Catacomb stratigraphy." },

  /* ---- Scythian / Early Iron ---- */
  { id: "bilsk", name: "Bilsk hillfort (Gelonus?)", name_uk: "Більське городище", lat: 50.1, lon: 34.73, acc: 5, type: "hillfort", periods: ["eiron"],
    notes: "One of the largest Early Iron Age hillforts in Europe (~5000 ha ramparts), Vorskla basin." },
  { id: "motronyn", name: "Motronyn hillfort", name_uk: "Мотронинське городище", lat: 49.08, lon: 32.3, acc: 5, type: "hillfort", periods: ["eiron"],
    notes: "Scythian-era forest-steppe hillfort, Kholodnyi Yar." },
  { id: "nemyriv", name: "Nemyriv hillfort", name_uk: "Немирівське городище", lat: 48.97, lon: 28.84, acc: 3, type: "hillfort", periods: ["eiron"],
    notes: "Early Scythian period hillfort in Podillia." },
  { id: "kamianske", name: "Kamianske hillfort", name_uk: "Кам'янське городище", lat: 47.48, lon: 34.42, acc: 6, type: "hillfort", periods: ["eiron"],
    notes: "Large Scythian steppe hillfort on the lower Dnipro; area affected by the Kakhovka reservoir drainage." },
  { id: "tovsta", name: "Tovsta Mohyla", name_uk: "Товста Могила", lat: 47.66, lon: 34.13, acc: 6, type: "barrow", periods: ["eiron"],
    notes: "Royal Scythian barrow (gold pectoral, 1971)." },
  { id: "chortomlyk_k", name: "Chortomlyk kurgan", name_uk: "Чортомлик", lat: 47.62, lon: 34.35, acc: 8, type: "barrow", periods: ["eiron"],
    notes: "Royal Scythian barrow near Nikopol." },
  { id: "solokha", name: "Solokha kurgan", name_uk: "Солоха", lat: 47.4, lon: 34.4, acc: 8, type: "barrow", periods: ["eiron"],
    notes: "Royal Scythian barrow (gold comb). Occupied territory." },
  { id: "haimanova", name: "Haimanova Mohyla", name_uk: "Гайманова Могила", lat: 47.35, lon: 35.05, acc: 8, type: "barrow", periods: ["eiron"],
    notes: "Scythian aristocratic barrow. Occupied territory." },

  /* ---- Greek colonies ---- */
  { id: "olbia", name: "Olbia", name_uk: "Ольвія", lat: 46.69, lon: 31.9, acc: 1, type: "city", periods: ["antiq"],
    notes: "Milesian colony on the Southern Bug estuary; national reserve." },
  { id: "berezan", name: "Berezan", name_uk: "Березань", lat: 46.6, lon: 31.41, acc: 1, type: "settlement", periods: ["antiq"],
    notes: "Earliest Greek settlement in the northern Black Sea (7th c. BCE)." },
  { id: "tyras", name: "Tyras", name_uk: "Тіра", lat: 46.2, lon: 30.35, acc: 1, type: "city", periods: ["antiq", "late_med"],
    notes: "Greek city under the Akkerman fortress, Bilhorod-Dnistrovskyi." },
  { id: "chersonesus", name: "Chersonesus Taurica", name_uk: "Херсонес Таврійський", lat: 44.61, lon: 33.49, acc: 1, type: "city", periods: ["antiq", "eslav", "rus"],
    notes: "UNESCO World Heritage. Occupied territory." },
  { id: "panticapaeum", name: "Panticapaeum (Kerch)", name_uk: "Пантікапей", lat: 45.35, lon: 36.47, acc: 1, type: "city", periods: ["antiq"],
    notes: "Bosporan capital on Mount Mithridates. Occupied territory." },
  { id: "neapolis", name: "Scythian Neapolis", name_uk: "Неаполь Скіфський", lat: 44.95, lon: 34.07, acc: 1, type: "city", periods: ["sarm", "antiq"],
    notes: "Late Scythian capital, Simferopol. Occupied territory." },

  /* ---- Late Iron Age, Roman period, Early Medieval ---- */
  { id: "zarubyntsi", name: "Zarubyntsi", name_uk: "Зарубинці", lat: 49.9, lon: 31.4, acc: 8, type: "burial", periods: ["sarm"],
    notes: "Eponymous cemetery of the Zarubyntsi culture near Kaniv; partly flooded." },
  { id: "chernyakhiv", name: "Chernyakhiv", name_uk: "Черняхів", lat: 49.94, lon: 30.63, acc: 10, type: "burial", periods: ["chern"],
    notes: "Eponymous cemetery of the Chernyakhiv culture (Kaharlyk area)." },
  { id: "komariv_glass", name: "Komariv glass workshop", name_uk: "Комарів", lat: 48.53, lon: 27.13, acc: 10, type: "workshop", periods: ["chern"],
    notes: "Roman-period glass-making workshop on the Dniester." },
  { id: "pastyrske", name: "Pastyrske hillfort", name_uk: "Пастирське городище", lat: 49.03, lon: 32.23, acc: 6, type: "hillfort", periods: ["eiron", "eslav"],
    notes: "Scythian hillfort reused by Early Slavs (Penkivka)." },
  { id: "zymne", name: "Zymne hillfort", name_uk: "Зимне", lat: 50.83, lon: 24.29, acc: 4, type: "hillfort", periods: ["eslav"],
    notes: "Early Slavic hillfort near Volodymyr, Volyn." },

  /* ---- Kyivan Rus ---- */
  { id: "kyiv_upper", name: "Kyiv Upper Town", name_uk: "Верхнє місто Києва", lat: 50.456, lon: 30.515, acc: 1, type: "city", periods: ["rus", "late_med", "cossack"],
    notes: "Capital of Kyivan Rus; deep urban stratigraphy." },
  { id: "chernihiv", name: "Chernihiv Dytynets", name_uk: "Чернігівський дитинець", lat: 51.49, lon: 31.31, acc: 1, type: "city", periods: ["rus"],
    notes: "Princely town; Chorna Mohyla and Gulbishche barrows nearby." },
  { id: "vyshhorod", name: "Vyshhorod", name_uk: "Вишгород", lat: 50.58, lon: 30.49, acc: 2, type: "city", periods: ["rus"], notes: "Princely residence town." },
  { id: "bilhorod_k", name: "Bilhorod Kyivskyi", name_uk: "Білгород Київський", lat: 50.37, lon: 30.22, acc: 2, type: "hillfort", periods: ["rus"], notes: "Fortified town on the Irpin." },
  { id: "pereiaslav", name: "Pereiaslav", name_uk: "Переяслав", lat: 50.07, lon: 31.46, acc: 2, type: "city", periods: ["rus", "cossack"], notes: "Rus princely town; Cossack regimental centre." },
  { id: "liubech", name: "Liubech", name_uk: "Любеч", lat: 51.7, lon: 30.66, acc: 2, type: "hillfort", periods: ["rus"], notes: "Castle hill on the Dnipro." },
  { id: "novhorod_s", name: "Novhorod-Siverskyi", name_uk: "Новгород-Сіверський", lat: 52.0, lon: 33.26, acc: 1, type: "city", periods: ["rus", "cossack"], notes: "" },
  { id: "kaniv", name: "Kaniv", name_uk: "Канів", lat: 49.75, lon: 31.46, acc: 2, type: "city", periods: ["rus", "cossack"], notes: "" },
  { id: "voin", name: "Voin hillfort", name_uk: "Воїнь", lat: 49.3, lon: 32.4, acc: 10, type: "hillfort", periods: ["rus"], notes: "Border fortress at the Sula mouth; flooded by the Kremenchuk reservoir." },
  { id: "zvenyhorod", name: "Zvenyhorod", name_uk: "Звенигород", lat: 49.69, lon: 24.18, acc: 3, type: "city", periods: ["rus"], notes: "Rus town near Lviv; waterlogged deposits with wooden structures." },
  { id: "plisnesk", name: "Plisnesk", name_uk: "Пліснеськ", lat: 49.94, lon: 24.97, acc: 3, type: "hillfort", periods: ["eslav", "rus"], notes: "Large hillfort complex near Pidhirtsi." },
  { id: "halych", name: "Halych (Krylos)", name_uk: "Давній Галич", lat: 49.1, lon: 24.72, acc: 2, type: "city", periods: ["rus"], notes: "Capital of the Principality of Galicia." },
  { id: "volodymyr", name: "Volodymyr", name_uk: "Володимир", lat: 50.85, lon: 24.32, acc: 1, type: "city", periods: ["rus"], notes: "Capital of Volhynia." },

  /* ---- Late medieval & Cossack ---- */
  { id: "tiahyn", name: "Tiahyn fortress", name_uk: "Тягинська фортеця", lat: 46.72, lon: 33.08, acc: 5, type: "fortress", periods: ["late_med"], notes: "Lithuanian/Tatar-era fortress on the lower Dnipro." },
  { id: "baturyn", name: "Baturyn", name_uk: "Батурин", lat: 51.35, lon: 32.88, acc: 1, type: "city", periods: ["cossack"], notes: "Hetman capital, destroyed 1708." },
  { id: "chyhyryn", name: "Chyhyryn", name_uk: "Чигирин", lat: 49.08, lon: 32.66, acc: 1, type: "fortress", periods: ["cossack"], notes: "Hetman residence and castle hill." },
  { id: "khortytsia", name: "Khortytsia", name_uk: "Хортиця", lat: 47.83, lon: 35.08, acc: 3, type: "fortress", periods: ["bronze", "eiron", "cossack"], notes: "Multi-period island; Cossack sites." },
  { id: "chortomlyk_sich", name: "Chortomlyk Sich", name_uk: "Чортомлицька Січ", lat: 47.61, lon: 34.35, acc: 3, type: "fortress", periods: ["cossack"], notes: "Area exposed after the 2023 Kakhovka reservoir drainage — high looting risk." },
  { id: "berestechko", name: "Berestechko battlefield", name_uk: "Берестечко", lat: 50.4, lon: 25.08, acc: 4, type: "battlefield", periods: ["cossack"], notes: "1651 battle; memorial complex at Plyasheva." },
  { id: "kodak", name: "Kodak fortress", name_uk: "Кодак", lat: 48.39, lon: 35.13, acc: 3, type: "fortress", periods: ["cossack"], notes: "Polish fortress (1635) at the head of the Dnipro Rapids." }
];
