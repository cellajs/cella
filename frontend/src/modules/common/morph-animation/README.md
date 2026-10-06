# Morph animation

A generative take on the mark: one WebGL2 fragment shader draws a "liquid pixel" cell
that continuously morphs, anchored to the logo. Two variants share the engine:
`single` (one resting cell, marketing hero) and `colony` (divides 1 → 2 → 3 → 5 and
flows back together, auth background).

`single` fills the container its caller gives it; the hero positions and blends it.
`colony` is the page background of the auth layout, which renders it bare: the
component lays itself out as a fixed, non-interactive layer at 20% opacity with
`mix-blend-multiply` (normal blending in dark mode). An app that replaces this module
with its own background owns that presentation too.

How it works:

- **One curve, many shapes.** The drawn boundary is a single parametric closed curve.
  Its settings produce the logo squircle (superellipse `n = 3.54`, which matches the
  mark's rounded-box bands at the axes and the corner diagonals), a circle, a rounded
  triangle, an organic blob and a soft diamond. Band centerlines sit at 0.4628 / 0.25
  in units where the full logo spans [-0.5, 0.5], taken from `logo-icon-only.svg`;
  the half-width is drawn at 0.05 (the mark's true 0.0372, thickened by taste).
- **Drift, not a timeline.** Each shape carries a slowly drifting score (layered
  off-beat sine waves); a sharpened softmax blends all five into the boundary. The
  logo holds the highest standing bias, so the flow keeps surfacing the mark at
  irregular intervals and never visibly resets.
- **Rotating duo-tone palette.** The four marketing-gradient hues get the same score
  treatment, so every frame has a specific one-or-two-hue palette that slowly rotates.
- **Soft-edge grains.** The field is quantized to a fine grid; cells outside the
  boundary survive probabilistically, shrink and fade individually, so the edge
  dissolves granularly. A grain stamps as a square or a small plus (`stamp` prop).
- **Theme-aware shading.** Dark mode glows: brighter band core, white rim. Light mode
  inverts: saturated hues, whiteish band body, a thin vivid contour, tuned for the
  low-opacity `mix-blend-multiply` layer both variants are shown in.
- **Mitosis.** Colony cells join through a smooth minimum, so a split pinches a shared
  membrane apart. Each daughter runs the same system at a time offset that scales with
  separation: siblings drift apart in character and re-synchronize as they merge.
- **Entrance = condense.** On mount the grain survival falloff starts wide open, so
  sparse grains dust the whole frame; it tightens over `ENTER_SECONDS` and the mark
  precipitates from the outside in. No grain travels. One uniform (`uEnter`) drives
  it, and at 1 the shader is the resting piece, so the entrance costs nothing after.
- **Reduced motion = slow, no entrance.** `prefers-reduced-motion` drops each instance
  to a fifth of its `speed` and skips the entrance for a plain opacity fade; the piece
  keeps living, gently.

The component props are the tuning surface per page: `variant`, `grid` (pixel density),
`speed` (clock scale, 1 = prototype pace), `overscan` (canvas margin around the shape;
below 1 it magnifies) and `stamp`. The static `+` texture language in
`styling/plus-grain.css` shares this module's pixel vocabulary for non-animated uses.

Cost: one fullscreen pass, no textures, no feedback buffers; at rest only one cell is
evaluated. The prototypes under `.todos/morph-animation/` document how the system was
found; the shader and the call sites now carry the authoritative tuned values.
