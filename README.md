# Poker Lab

Browser-based No-Limit Hold'em trainer. Play 6-max cash games or tournaments against AI opponents, get hand-by-hand coaching, and track your stats over time.

**[Live demo](https://loganchap.github.io/poker-lab)**

---

## Features

- **5 AI archetypes** — station, TAG, LAG, nit, and maniac, each with distinct preflop and postflop probability tables
- **Coaching engine** — reviews every hand and flags leaks: passive play, bad calls, missed value bets, bluffing into calling stations, and more
- **Stats tracking** — VPIP, PFR, aggression factor, bb/100, fold-to-cbet, stored in localStorage
- **Pattern coaching** — unlocks after 50 hands and identifies recurring leaks across your session
- **Tournament mode** — escalating blinds with configurable schedules
- **Position guide** — tap any position badge for opening ranges and strategic notes
- **Opponent profiles** — tap any AI seat to see how to exploit that player type

---

## Stack

Vanilla JS with ES modules — no frameworks, no build step, no dependencies.

```
index.html        # HTML shell
css/
  style.css       # All styling
js/
  deck.js         # Deck, card helpers, utilities
  equity.js       # Hand evaluation, Chen formula, Monte Carlo equity
  ai.js           # AI decision logic and opponent profiles
  stats.js        # Data model, localStorage persistence
  coach.js        # Coaching engine and pattern leak detection
  game.js         # Game state, hand flow, render layer
  render.js       # Re-export facade for render functions
```

---

## Run locally

```bash
git clone https://github.com/loganchap/poker-lab.git
cd poker-lab
npx serve .
```

Open `http://localhost:3000`. ES modules require a local server — opening `index.html` directly won't work.
