/**
 * Типы зомби. Sprite look: tint умножается на базовый зелёный цвет спрайта.
 */
/* mass — сопротивление отбросу пулями: чем больше, тем меньше сносит
 * (импульс = strength / mass). Ходок — эталон, бегун лёгкий, громила танк. */
export const ZOMBIE_TYPES = {
  walker: {
    id: 'walker',
    name: 'Ходок',
    speed: 70,
    hp: 60,
    damage: 10,
    scale: 1,
    tint: 0xffffff,
    score: 10,
    mass: 1.0     // эталон сопротивления отбросу
  },
  runner: {
    id: 'runner',
    name: 'Бегун',
    speed: 130,
    hp: 40,
    damage: 8,
    scale: 0.9,
    tint: 0xa8c8e8,
    score: 15,
    mass: 0.7     // лёгкий — сносится заметно дальше ходока
  },
  brute: {
    id: 'brute',
    name: 'Громила',
    speed: 45,
    hp: 180,
    damage: 25,
    scale: 1.35,
    tint: 0xe8a878,
    score: 30,
    mass: 2.75    // танк: пистолет едва сдвигает, дробь шатает
  }
};
