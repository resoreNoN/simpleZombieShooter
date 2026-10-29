/**
 * Волны по уровням: список волн, каждая — словарь {тип: количество}.
 */
export const WAVES_PER_LEVEL = [
  [ // Уровень 1
    { walker: 5 },
    { walker: 6, runner: 2 },
    { walker: 8, runner: 4, brute: 1 }
  ],
  [ // Уровень 2
    { walker: 6, runner: 2 },
    { walker: 6, runner: 4, brute: 1 },
    { walker: 8, runner: 6, brute: 2 }
  ],
  [ // Уровень 3
    { walker: 8, runner: 4, brute: 1 },
    { walker: 8, runner: 6, brute: 2 },
    { walker: 10, runner: 8, brute: 3 },
    { walker: 12, runner: 8, brute: 4 }
  ],
  [ // Уровень 4 — финал: плотные составы, обе возрастающие группы
    { walker: 10, runner: 6, brute: 2 },
    { walker: 12, runner: 8, brute: 3 },
    { walker: 14, runner: 10, brute: 4 },
    { walker: 16, runner: 12, brute: 4 }
  ]
];
