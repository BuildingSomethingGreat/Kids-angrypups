# Angry Pups 🐶 A Force & Motion Science Fair Game

A mobile-first slingshot physics game built for our science fair project about **force**.
The characters, foam and slingshot are all based on our real build: two toy pups
(Biscuit and Marshmallow), white foam balls and foam blocks, and the pink and purple
slingshot box with wooden dowels and rubber bands.

![Title screen](docs/title.jpg)

| Gameplay | Lab Report | Portrait |
|---|---|---|
| ![Gameplay](docs/gameplay.jpg) | ![Lab report](docs/lab-report.jpg) | ![Portrait](docs/portrait.jpg) |

## Play it

The game is plain HTML/CSS/JavaScript with no build step.

- **Quickest:** open `index.html` in a browser (works straight from the folder).
- **On a phone over Wi-Fi:** from this folder run `python3 -m http.server 8000`, then open
  `http://<your-computer's-IP>:8000` on the phone.
- **Online:** https://buildingsomethinggreat.github.io/Kids-angrypups/
  Every push redeploys automatically through `.github/workflows/deploy-pages.yml`, which
  first re-runs the physics checks. (One-time setup: **Settings → Pages → Source: GitHub
  Actions**.) Any static host (Netlify, Vercel, Cloudflare Pages) works too.
- On a phone you can **Add to Home Screen** and it opens full-screen like an app.

**How to play:** drag back on the foam ball in the slingshot and let go. Pick a ball
from the tray: **Zip** (light), **Bop** (medium) or **Chonk** (heavy). Knock out every
pup before you run out of balls. Taped foam and pups wearing bottle-cap helmets need
several hits. On a phone, turn it sideways for the best view (the game reminds you).

## The science, for kids

Everything on screen is written for a 3rd grader: no formulas, just "more or less" and
"light or heavy". The **Force Lab** panel shows Pull, Push, Speed and Hit as meters with
words like *a little*, *a lot*, *fast* and *KABOOM!*

Each of the 10 levels teaches one big idea:

1. **Stretch It!** More pull = more push
2. **Light or Heavy?** Light = fast, heavy = strong
3. **Tough Stuff** Tough things need more hits
4. **Topple Tower** Push up high = easy to tip (then gravity pulls it down)
5. **Pup Fortress** Use it all!
6. **Sky High** Up high = big fall (pups on every floor of a tall tower)
7. **Hide and Seek** Walls soak up pushes (pups hidden behind layers)
8. **Bridge Battle** No support = it falls
9. **Pup Pyramid** Heavy = strong (pups packed inside a pyramid)
10. **Castle Keep** The final test

Every level is checked by `tools/simtest.js`: it must stand still on its own and a
simulated player must be able to clear it with the balls it gives you.

The Force Lab's **Pull** meter uses *low, medium and large*, the same pull-back
distances as the real experiment, colored like the real launcher (pink = medium,
purple = large).

After each level, the **Lab Report** shows the biggest pull, fastest ball and hardest
hit, plus a "What we learned" sentence.

*Try it with the real slingshot:* pull the ball back a little, then a lot. Which one
flies farther? Then try a big ball and a small ball with the same pull.

## Behind the scenes

[`behind-the-scenes.html`](https://buildingsomethinggreat.github.io/Kids-angrypups/behind-the-scenes.html)
tells the story of the real experiment in my daughter's own words: why she picked
force, what she used, how we built the launcher, her procedure, her results chart
(redrawn from her board) and what she learned. It's linked from the title screen.

## The science, for grown-ups

Under the hood the game runs a real physics engine
([planck.js](https://github.com/piqnt/planck.js), a port of Box2D) in SI units with
gravity g = 9.8 m/s². The kid-friendly words are just labels on these numbers. The same
math is in a collapsed "For grown-ups" note on the in-game science screen.

| Idea | Formula | How the game uses it |
|---|---|---|
| Spring force (Hooke's law) | `F = k × x` | The slingshot band is a spring with k = 100 N/m that pushes the ball every physics step until it passes the rest point. |
| Energy → speed | `½kx² = ½mv²` | The same pull gives every ball the same energy, so light balls (Zip 0.5 kg) fly faster than heavy ones (Chonk 2 kg). |
| Momentum | `p = m × v` | Heavy balls are slower but carry more momentum, so they shove heavy things around. |
| Impulse | `J = F × Δt` | Damage is the collision impulse read from the physics solver. Foam soaks up the first 1 N·s of each hit; tough materials need several big impulses. |
| Gravity & torque | `τ = F × d` | Hitting a tall tower high up tips it over, and gravity does the rest. |

## How it was made

- **Art:** generated with [Higgsfield](https://higgsfield.ai), using our photos of the
  pups, foam balls, foam shapes and slingshot as references (GPT Image 2.5 with
  transparent backgrounds). `tools/build_assets.py` slices the sheets into a single
  sprite atlas: 8 pup poses (angry / hurt / knocked-out / helmet × 2 pups), 3 foam
  ball heroes and the slingshot.

  ![Sprite sheet](docs/spritesheet.jpg)

- **Title video:** two looping cinematic shots (landscape and portrait) animated with
  Kling 3.0 Pro on Higgsfield. Each one starts and ends on the same frame, so the loop
  is seamless.
- **Sound & music:** synthesised live with the Web Audio API (no audio files).
- **Fonts:** Lilita One and Nunito (SIL Open Font License).

## Project layout

```
index.html            screens + HUD markup
behind-the-scenes.html  the story of the real experiment (photos in assets/bts)
css/style.css         mobile-first styles (portrait control deck, landscape HUD)
js/sim.js             physics + rules (no DOM, shared with the Node tests)
js/levels.js          the 5 levels and their kid-friendly science text
js/game.js            renderer, camera, touch input, particles
js/main.js            screens, Force Lab panel, lab reports, saved progress
js/audio.js           Web Audio sound effects and music
js/atlas-data.js      sprite atlas map (generated)
assets/               sprites, backgrounds, logo, title videos, fonts
art/                  original Higgsfield images and the full sprite sheet
tools/                asset build script and automated tests
vendor/planck.min.js  physics engine (MIT)
```

## Tests

```bash
node tools/simtest.js            # every level stands still on its own and can be won
python3 -m http.server 8765 &
node tools/smoke.js              # loads the game on phone and desktop sizes, takes screenshots
node tools/simtest.js --json && node tools/playtest.js   # plays all 5 levels with real drags
```

`simtest.js` runs a "greedy player" through the real physics to prove each level can be
cleared with the balls provided. The browser tests need Playwright.
