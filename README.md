# Poker Lab

A browser-based No-Limit Hold'em trainer. Play 6-max cash games or tournaments against AI opponents, get hand-by-hand coaching, and track your stats over time.

**[Live demo](https://loganchap.github.io/poker-lab)** — or clone and run locally with `npx serve .`

---

## Features

- **5 AI archetypes** — station, TAG, LAG, nit, and maniac, each with distinct probability tables for preflop and postflop decisions
- **Coaching engine** — reviews every hand and flags leaks (passive play, bad calls, missed value bets, bluffing into calling stations, etc.)
- **Stats tracking** — VPIP, PFR, aggression factor, bb/100, fold-to-cbet, and more, stored in localStorage
- **Pattern coaching** — unlocks after 50 hands and identifies recurring leaks across your session
- **Tournament mode** — escalating blinds with configurable schedules
- **Position guide** — tap any position badge for opening ranges and strategic notes
- **Opponent profiles** — tap any AI seat to see how to exploit that player type

## How to run

```bash
git clone https://github.com/loganchap/poker-lab.git
cd poker-lab
npx serve .
```

Then open `http://localhost:3000` in your browser. ES modules require a local server — opening `index.html` directly won't work.

## Project structure

```
index.html        # HTML shell (247 lines)
css/
  style.css       # All styling
js/
  deck.js         # Deck, card helpers, utilities
  equity.js       # Hand evaluation, Chen formula, Monte Carlo equity
  ai.js           # AI decision logic and opponent profiles
  stats.js        # Data model, localStorage persistence
  coach.js        # Coaching engine and pattern leak detection
  game.js         # Game state, hand flow, render layer, boot
  render.js       # Re-export facade for render functions
```

## Tech

Vanilla JS with ES modules — no frameworks, no build step, no dependencies.
