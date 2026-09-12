# Forest Energy Game Page Override

This page overrides the dark event-game styling in `../MASTER.md`.

## Locked Product Story

- Device: LG StanbyME in portrait orientation, designed at `1080 × 1920` and responsive down to phone preview widths.
- Core gesture: press and hold the forest seed to start timing; release to stop. There is no countdown and no second tap.
- Goal: strict exact match at `7.30` seconds, with three attempts per player.
- Story: every hold injects life energy into the forest. Missed attempts still accumulate visible growth; an exact match opens the seed and grows a young tree.
- Character: MORI stays partially hidden during normal play, encourages after a miss, and fully jumps into view only on success.

## Art Direction

- Premium warm watercolor storybook illustration with paper grain and soft botanical edges.
- Keep one permanent portrait forest background across every phase. Never flash, replace, shake, or pulse the full background.
- Preserve the supplied seed identity: rounded acorn-like body, scalloped cap, short stem, and two leaves.
- Preserve MORI identity: cream-and-tan squirrel, acorn-cap hair with two leaves, large curled tail, green scarf, rosy cheeks, and wooden `MORI` tag.
- Primary energy colors: forest green, moss, warm ivory, soft gold, and leaf yellow-green.

## Layout Rules

- Keep the timer and current attempt in the upper half for spectators several meters away.
- Keep the forest seed centered in the lower half and at least `70%` of the portrait canvas width on 1080 × 1920.
- The seed is the only primary player control. Operator preview and fullscreen tools stay small in the top-right corner.
- Do not place persistent UI over the timer digits or the seed's primary silhouette.
- Use tabular figures and a high-contrast dark green timer on a calm light portion of the background.

## Interaction and Motion

- On `pointerdown`, start the stopwatch immediately and capture the pointer.
- On `pointerup`, `pointercancel`, `touchend`, or `touchcancel`, stop immediately and judge the exact hundredth already visible on screen. Never recalculate or overwrite the digits after release; the displayed number is the single source of truth for players and staff.
- The timer digits own the main visual emphasis: dark-green tabular figures remain readable while a gold duplicate glow increases with charge.
- A transparent watercolor tree stays behind the digits, growing from the roots with `transform` and becoming brighter with layered opacity as the timer increases. Completed attempts preserve a quieter cumulative tree state.
- Charging uses a stable closed seed plus an increasingly opaque green-gold light layer. Never fade the physical seed itself away.
- Reveal sequence: closed → charging → naturally opening → young tree on success; return to closed after a miss.
- Only animate transform, opacity, and compositor-friendly filters. Lite mode removes orbit effects and shortens crossfades.
- Respect `prefers-reduced-motion`; all results remain understandable through text and static state changes.
- Keyboard alternative: hold Space, Enter, Numpad Enter, or Numpad 0; release to stop.
- Sound follows the same causal sequence: start chime → rising life-energy hum → accelerating target pulses → release/crack → directional miss encouragement or success growth fanfare and MORI chirps.
- Sound is generated locally with Web Audio, begins only after a user gesture, remains lightweight in LG mode, and always has a persistent accessible on/off control.

## Result Language

- Miss: state whether energy released early or late, show the difference, and explicitly say the energy remains in the forest.
- Three misses: thank the player and show their best time; do not frame participation as environmental failure.
- Win: show exact `7.30`, the opened seed with a tree, MORI celebrating, and a clear instruction to show the screen to staff.
- Never claim that the activity plants a real tree unless an external verified program actually does so.
