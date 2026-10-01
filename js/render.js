/* =====================================================
   render.js — render interface
   All render and UI functions live in game.js.
   This file re-exports them as a clean named surface
   so callers can import from './render.js' if needed.
   ===================================================== */
export {
  renderAll, renderTicker, renderMode,
  renderSeats, renderCenter, renderLog, renderMe, renderActions,
  cardHTML,
  renderStatsView, setScope, statusDot, toggleEquity, clearHistory, resetAll,
  renderHistory, toggleHand,
  showView, setMode, setModeForce, rebuy, endGameButtons, replaySetup, endSession,
  positionGuide, villainCard,
  buildAiSlots, openSetup, startFromSetup, buildCustomSchedule,
  setOppMode, setHintMode, pickSched, updateSetupUI,
  SCHED_PRESETS,
  showModal, closeModal,
} from './game.js';
