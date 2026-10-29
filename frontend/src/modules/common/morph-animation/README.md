# Morph animation

A generative take on the mark: one WebGL2 fragment shader draws a "liquid pixel" cell
that continuously morphs, anchored to the logo. Three variants share the engine:
`single` (one resting cell, marketing hero), `colony` (divides 1 → 2 → 3 → 5 and
flows back together, auth background) and `database` (the database icon in the same
grains, features page).

`single` and `database` fill the container their caller gives them; the page positions
and blends them.
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
- **The database icon.** `database` swaps the morphing curve for the distance to the
  strokes of lucide's database icon, with rounded joins, thicker strokes and more warp
  than the mark, so it reads as a blob first and its three discs second. Grains,
  palette, entrance and fizz work as they do for the mark.
- **Mitosis.** Colony cells join through a smooth minimum, so a split pinches a shared
  membrane apart. Each daughter runs the same system at a time offset that scales with
  separation: siblings drift apart in character and re-synchronize as they merge.
- **Entrance = condense.** On mount the grain survival falloff starts wide open, so
  sparse grains dust the whole frame; it tightens over `enterSeconds` and the mark
  precipitates from the outside in. No grain travels. One uniform (`uEnter`) drives
  it, and at 1 the shader is the resting piece, so the entrance costs nothing after.
- **Reduced motion = slow, no entrance.** `prefers-reduced-motion` drops each instance
  to a fifth of its `speed` and skips the entrance for a plain opacity fade; the piece
  keeps living, gently. A still holds its frame without fizzing.

The component props are the tuning surface per page: `variant`, `grid` (pixel density),
`speed` (clock scale, 1 = prototype pace), `overscan` (canvas margin around the shape;
below 1 it magnifies), `stamp`, `still` and `fizz`. A still freezes the clock at a chosen value:
the piece condenses in on mount, in view or not, then holds that frame and draws again only
when the theme or another prop changes, so a page can show a fixed shape and palette at no
ongoing cost. `fizz` keeps a still's grains alive on a clock of their own while the shape
and palette hold: the grid slowly wavers and edge grains flicker and fade in and out. A
fizzing still draws while in view, as a running piece does. `grid` counts cells across the canvas, so grains
shrink with it; `minGrainPx` in the renderer stops that at a size that still reads as
a pixel, and a phone-sized canvas draws the same piece with fewer, larger grains. Below
the `sm` breakpoint `minGrainPxPhone` takes over, so a phone's grains come out larger
than a desktop's. The static `+` texture language in
`styling/plus-grain.css` shares this module's pixel vocabulary for non-animated uses.

Cost: one fullscreen pass, no textures, no feedback buffers; at rest only one cell is
evaluated. A canvas larger than a full HD screen renders at a lower resolution, so it costs
no more than that screen. The prototypes under `.todos/morph-animation/` document how the system was
found; the shader and the call sites carry the final tuned values.
