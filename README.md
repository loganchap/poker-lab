<div align="center">

# 🃏 Poker Lab

**A free, no-install poker trainer that runs in your browser.**

Play no-limit hold'em against AI opponents and get coached on every decision.

[![Live Demo](https://img.shields.io/badge/▶%20Play%20Now-Live%20Demo-2ea44f?style=for-the-badge)](https://loganchap.github.io/poker-lab/poker-lab.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/Dependencies-None-orange?style=for-the-badge)]()
[![Single File](https://img.shields.io/badge/Size-Single%20File-purple?style=for-the-badge)]()

</div>

---

## What is this?

I built Poker Lab to teach myself poker. It's a no-limit hold'em trainer (2–9 players) that gives you real coaching feedback on every hand — not just win/loss, but *why* a play was good or bad.

No signup. No server. No cost. Open the file and play.

---

## Features

| | |
|---|---|
| 🤖 **5 AI opponent types** | Station, TAG, LAG, Nit, Maniac — each plays differently |
| 🎓 **Hand-by-hand coaching** | Feedback on every decision you make |
| 📊 **Session stats** | Track VPIP, win rate, and stack over time |
| ♠️ **Full game engine** | Monte Carlo equity, Chen formula, pot odds |
| 🎯 **Leak detection** | Flags recurring mistakes in your game |
| ⚡ **Instant play** | No install, no account, works offline |

---

## How to play

**Online:** [loganchap.github.io/poker-lab/poker-lab.html](https://loganchap.github.io/poker-lab/poker-lab.html)

**Locally:** Download `poker-lab.html` and open it in any browser. That's it.

---

## What you'll learn

- **Preflop ranges** — which hands to play from each position
- **Pot odds** — when calling is mathematically correct
- **Position** — why acting last is a massive edge
- **Bluff spots** — when semi-bluffs and pure bluffs are profitable
- **Opponent reads** — adjusting to different player types

---

## Tech

Pure vanilla HTML, CSS, and JavaScript — no frameworks, no dependencies, no build step. Everything is in one file.

- Hand evaluation via bitwise rank/suit encoding
- Equity via Monte Carlo simulation
- Preflop strength via Chen formula
- AI decision trees per opponent archetype

---

## Contributing

Found a bug or want to add something? Open an issue or PR — contributions welcome.

---

<div align="center">

Built by [@loganchap](https://github.com/loganchap) · MIT License

</div>
