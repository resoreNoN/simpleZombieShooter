/**
 * Данные уровней.
 * Координаты — в тайлах (64px); width/height — размер арены в тайлах,
 * границы мира считаются из них.
 *
 */
export const TILE = 64;

export const LEVELS = [
  {
    name: 'Начальный лагерь',
    // Размер арены в тайлах (TILE=64): границы мира/спавн/рейкаст считаются из него
    width: 27,
    height: 20,
    playerSpawn: { tx: 2, ty: 2 },
    crates: [
      { tx: 8, ty: 4 }, { tx: 9, ty: 4 }, { tx: 10, ty: 4 },
      { tx: 18, ty: 12 }, { tx: 18, ty: 13 },
      { tx: 5, ty: 13 }, { tx: 22, ty: 3 }
    ],
    wallRuns: [
      // Горизонтальная стена
      { from: { tx: 12, ty: 7 }, length: 4 },
      // Вертикальная стена
      { from: { tx: 20, ty: 8 }, length: 3, vertical: true }
    ],
    // Растительность: деревья (ствол — препятствие, крона сверху), кусты (декор)
    trees: [
      { tx: 16.5, ty: 3.5 },
      { tx: 4, ty: 10 },
      { tx: 24, ty: 18 },
      { tx: 12, ty: 16 },
      { tx: 21, ty: 15 }
    ],
    bushes: [
      { tx: 7, ty: 2 }, { tx: 19, ty: 5 },
      { tx: 13, ty: 12.5 }, { tx: 3, ty: 16 },
      { tx: 24, ty: 11 }, { tx: 14, ty: 19 },
      { tx: 25, ty: 2 }, { tx: 9, ty: 9 }
    ]
  },
  {
    name: 'Двор склада',
    width: 27,
    height: 20,
    playerSpawn: { tx: 2, ty: 15 },
    crates: [
      { tx: 6, ty: 6 }, { tx: 7, ty: 6 }, { tx: 6, ty: 7 },
      { tx: 14, ty: 3 }, { tx: 16, ty: 3 },
      { tx: 20, ty: 14 }, { tx: 21, ty: 12 }, { tx: 12, ty: 16 }
    ],
    wallRuns: [
      { from: { tx: 10, ty: 10 }, length: 5 },
      { from: { tx: 17, ty: 4 }, length: 4, vertical: true },
      { from: { tx: 3, ty: 9 }, length: 3, vertical: true }
    ],
    trees: [
      { tx: 23, ty: 3.5 },
      { tx: 10.5, ty: 2.5 },
      { tx: 24, ty: 17.5 },
      { tx: 3, ty: 3 },
      { tx: 15, ty: 13.5 }
    ],
    bushes: [
      { tx: 4, ty: 13 }, { tx: 9, ty: 7 },
      { tx: 19, ty: 8 }, { tx: 25, ty: 12 },
      { tx: 2, ty: 5 }, { tx: 13, ty: 18 },
      { tx: 18, ty: 16 }, { tx: 22, ty: 9 }
    ]
  },
  {
    name: 'Цитадель',
    width: 27,
    height: 20,
    playerSpawn: { tx: 12, ty: 15 },
    crates: [
      { tx: 4, ty: 4 }, { tx: 4, ty: 5 }, { tx: 23, ty: 4 }, { tx: 23, ty: 5 },
      { tx: 4, ty: 14 }, { tx: 23, ty: 14 },
      { tx: 18, ty: 7 }, { tx: 19, ty: 8 }, { tx: 18, ty: 9 }, { tx: 8, ty: 8 }, { tx: 7, ty: 7 }
    ],
    wallRuns: [
      { from: { tx: 10, ty: 2 }, length: 6 },
      { from: { tx: 10, ty: 16 }, length: 6 },
      { from: { tx: 6, ty: 10 }, length: 4, vertical: true },
      { from: { tx: 19, ty: 10 }, length: 4, vertical: true }
    ],
    trees: [
      { tx: 2, ty: 2 },
      { tx: 24, ty: 11 },
      { tx: 12, ty: 11.5 },
      { tx: 2, ty: 18 },
      { tx: 25, ty: 18 }
    ],
    bushes: [
      { tx: 8, ty: 2 }, { tx: 16, ty: 7 },
      { tx: 21, ty: 3 }, { tx: 4, ty: 10 },
      { tx: 14, ty: 3 }, { tx: 20, ty: 18 },
      { tx: 9, ty: 13 }, { tx: 25, ty: 6 },
      { tx: 1, ty: 12 }, { tx: 16, ty: 19 }
    ]
  }
];
