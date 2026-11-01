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
      concept: 'More pull, more push',
      rules: ['More pull = more push!'],
      goal: 'Bonk both pups with Bop!',
      tip: 'Pull the band back a little for a small push. Pull it back a lot for a BIG push. Watch the push meter!',
      learned: 'When we pulled the band back more, it pushed the ball harder and it flew farther. More pull = more push!',
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
      name: 'Light or Heavy?',
      concept: 'Light vs. heavy',
      rules: ['Light = fast', 'Heavy = strong'],
      goal: 'Zip is light. Chonk is heavy. Pick the best ball for each pup!',
      tip: 'The same pull makes light Zip zoom fast. Heavy Chonk flies slower, but it hits harder and can shove big things.',
      learned: 'Light balls fly faster. Heavy balls fly slower, but they hit harder. Pick the right ball for the job!',
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
      concept: 'Hit it again!',
      rules: ['Tough things need more hits'],
      goal: 'Taped foam and helmet pups are tough. Keep hitting them!',
      tip: 'Every hit adds up. Hard hits do more than soft hits. Taped foam and helmets need a few big hits before they break.',
      learned: 'One hit was not enough. Lots of hits added up until the tough stuff broke!',
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
      concept: 'Push high, it falls',
      rules: ['Push up high = easy to tip'],
      goal: 'Knock the tall tower down on the pups!',
      tip: 'Hit a tall tower up high and it tips over easily. Then gravity pulls everything down. Crash!',
      learned: 'A push near the top tipped the tall tower over. Then gravity pulled it all down!',
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
      concept: 'Use it all!',
      rules: ['More pull = more push', 'Light = fast', 'Heavy = strong'],
      goal: 'The boss pups are hiding. Use everything you learned!',
      tip: 'Use light Zip for high, fast shots. Use heavy Chonk for big pushes. Keep hitting the tough parts!',
      learned: 'You used pulls, pushes, light and heavy balls, and gravity. You are a force expert!',
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
