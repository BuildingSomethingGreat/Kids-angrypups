/*
 * Angry Pups — level data.
 * Coordinates are metres. x grows to the right, y up, the tabletop is y = 0.
 * `b` is the bottom edge of an object (easier to stack things by hand).
 * The slingshot pouch rests at x = 4.6 m, 1.8 m above the table.
 */
(function (root) {
  'use strict';

  function box(x, b, w, h, mat) { return { t: 'box', x: x, b: b, w: w, h: h, mat: mat || 'foam' }; }
  function disc(x, b, r, mat) { return { t: 'disc', x: x, b: b, r: r, mat: mat || 'foam' }; }
  function pup(kind, x, b, helmet) { return { t: 'pup', kind: kind, x: x, b: b, helmet: !!helmet }; }

  var LEVELS = [
    {
      id: 1,
      name: 'Stretch It!',
      concept: "Hooke's Law",
      formula: 'F = k × x',
      goal: 'Knock out both pups with Bop the medium foam ball.',
      tip: 'The farther you stretch the band (x), the harder it pushes (F). Try a small pull first, then a big one, and watch the force meter.',
      learned: "Stretching the band twice as far gave twice the force. That's Hooke's law: F = k × x.",
      balls: ['m', 'm', 'm'],
      stars: [20000, 29000],
      objects: [
        box(15.4, 0, 0.4, 1.4),
        box(18.6, 0, 0.4, 1.4),
        box(17.0, 1.4, 3.8, 0.35),
        pup('biscuit', 17.0, 1.75),
        box(21.2, 0, 0.9, 0.9),
        pup('marsh', 21.2, 0.9),
      ],
    },
    {
      id: 2,
      name: 'Mass Matters',
      concept: 'Mass, speed & momentum',
      formula: ['v = x × √(k ÷ m)', 'p = m × v'],
      goal: 'Zip is light and fast. Chonk is heavy and slow. Pick the right ball for each pup!',
      tip: 'With the same pull, light Zip flies about twice as fast as heavy Chonk. But Chonk carries more momentum (p = m × v), so it shoves heavy things around.',
      learned: 'Same stretch, same energy. The light ball got more speed, and the heavy ball got more momentum. Pick the ball that fits the job.',
      balls: ['s', 'l', 's', 'l'],
      stars: [22000, 32000],
      objects: [
        box(14.8, 0, 0.6, 2.4, 'dense'),
        pup('marsh', 16.0, 0),
        box(17.2, 0, 0.5, 1.0),
        box(19.0, 0, 0.45, 2.0),
        box(21.4, 0, 0.45, 2.0),
        box(20.2, 0, 1.0, 1.0),
        box(20.2, 2.0, 3.0, 0.35),
        pup('biscuit', 20.2, 2.35),
      ],
    },
    {
      id: 3,
      name: 'Tough Stuff',
      concept: 'Impulse & repeated force',
      formula: 'J = F × Δt',
      goal: 'Taped foam and helmet pups are tough. Keep hitting the same spot!',
      tip: 'Every hit delivers an impulse (force × time). Taped foam and bottle-cap helmets need several big impulses before they give up.',
      learned: 'One hit was not enough. Impulses from several hits added up until the taped foam and the helmet broke.',
      balls: ['m', 'l', 'm', 'l'],
      stars: [22000, 31000],
      objects: [
        box(16.6, 0, 0.6, 1.7, 'taped'),
        box(20.4, 0, 0.6, 1.7, 'taped'),
        box(18.5, 1.7, 4.4, 0.4, 'taped'),
        pup('marsh', 18.5, 0, true),
        pup('biscuit', 18.5, 2.1),
        disc(22.3, 0, 0.5),
      ],
    },
    {
      id: 4,
      name: 'Topple Tower',
      concept: 'Gravity & torque',
      formula: 'τ = F × d',
      goal: 'Bring the whole tower down on the pups.',
      tip: 'A push high up on a tall tower makes it tip over. That turning effect is called torque (force × distance). Then gravity pulls it all down!',
      learned: 'Hitting high gave a bigger turning effect (torque), and gravity did the rest. Tall, skinny towers tip over easily.',
      balls: ['m', 'l', 'm', 'l'],
      stars: [27000, 37000],
      objects: [
        box(18.2, 0, 0.4, 1.6),
        box(20.2, 0, 0.4, 1.6),
        box(19.2, 1.6, 2.6, 0.3),
        box(18.4, 1.9, 0.4, 1.5),
        box(20.0, 1.9, 0.4, 1.5),
        pup('marsh', 19.2, 1.9),
        box(19.2, 3.4, 2.2, 0.3),
        box(18.6, 3.7, 0.35, 1.2),
        box(19.8, 3.7, 0.35, 1.2),
        box(19.2, 4.9, 1.8, 0.3),
        pup('biscuit', 19.2, 5.2),
        pup('biscuit', 21.3, 0),
        disc(22.6, 0, 0.45),
      ],
    },
    {
      id: 5,
      name: 'Pup Fortress',
      concept: 'Put it all together',
      formula: ['F = k × x', 'p = m × v', 'J = F × Δt'],
      goal: 'The pup bosses are dug in. Use every trick you have learned!',
      tip: 'Use Zip for fast lobs, Chonk for big shoves, and keep hitting the tough parts. Pull back hard when you need more force!',
      learned: 'You used spring force, mass, momentum, impulse and gravity together. That is real physics!',
      balls: ['s', 'm', 'l', 'm', 'l'],
      stars: [38000, 48000],
      objects: [
        box(14.5, 0, 0.5, 1.2),
        pup('biscuit', 14.5, 1.2),
        box(17.0, 0, 0.5, 2.2, 'dense'),
        box(19.0, 0, 0.5, 2.2, 'dense'),
        box(18.0, 2.2, 2.7, 0.35, 'taped'),
        pup('marsh', 18.0, 0, true),
        pup('biscuit', 18.0, 2.55, true),
        box(21.2, 0, 0.45, 1.6),
        box(23.2, 0, 0.45, 1.6),
        box(22.2, 0, 0.9, 0.9),
        box(22.2, 1.6, 2.6, 0.3),
        pup('marsh', 22.2, 1.9),
      ],
    },
  ];

  root.AP = root.AP || {};
  root.AP.LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
