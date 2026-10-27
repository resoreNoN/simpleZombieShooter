/**
 * Параметры оружия.
 * ammo: Infinity — бесконечный боезапас (пистолет).
 * auto: true — стрельба при удержании ЛКМ.
 * pellets: число одновременных «зарядов» выстрела (дробовик — веер).
 * Клавиши: 1 — пистолет, 2 — дробовик, 3 — автомат.
 */
export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'Пистолет',
    key: '1',
    damage: 14,
    fireRate: 480,        // мс между выстрелами
    bulletSpeed: 700,     // пикс/с
    range: 600,           // дальность полёта, пикс
    spread: 0.035,        // разброс, рад
    ammo: Infinity,
    auto: true,
    pellets: 1,
    bulletScale: 1,
    knockback: 80        // отброс зомби, пикс/с (импульс при попадании)
  },
  shotgun: {
    id: 'shotgun',
    name: 'Дробовик',
    key: '2',
    damage: 13,           // за каждый заряд
    fireRate: 850,
    bulletSpeed: 560,
    range: 430,           // дробь быстро сходит на нет
    spread: 0.17,         // полный конус выстрела
    pellets: 6,
    ammo: 24,
    auto: false,
    bulletScale: 0.8,
    knockback: 60         // на каждый заряд: веер суммарно даёт сильный толчок
  },
  rifle: {
    id: 'rifle',
    name: 'Автомат',
    key: '3',
    damage: 14,
    fireRate: 110,        // высокая скорострельность
    bulletSpeed: 760,
    range: 720,
    spread: 0.055,
    ammo: 120,
    auto: true,
    pellets: 1,
    bulletScale: 1.15,
    knockback: 40
  }
};
