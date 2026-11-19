# SDD ledger — plan: docs/superpowers/plans/2026-11-19-p1-room-shell-and-light.md
Branch: p1-room-shell (ruling: branch instead of worktree — Windows worktree would need a second node_modules and break the Instabox push path; isolation is preserved by branch + no push)

## Tasks done
- T1 layout module + coordinate migration (all consumers)
- T3 chamferBox kit (44 tris, flat facets) + triCount
- T4 six material families (cached singletons)
- T5 room shell (thick walls, 2.2 m doorway, terracotta cut trim, skirting, floor)
- T2 camera solve (32 fov, 46 px floor, cover framing, pan = walkable)
- T6 light rig v4 (sun + pendant + fridge, ambient 0.08)

## Rulings
- Bay triggers 0.9 m at |x|=3.2 (1.0 m at 3.3 pokes through the wall).
- Queue slot 2 at z 3.6 (3.9 sat exactly on the walkable edge).
- Camera fill band 82-88 % is arithmetically impossible with a 46 px character:
  screen character height is 1.62*cos(elev)/roomDiagonal of the projected width, and
  the 8.4x9.2 room projects a 12.45 m diamond at 45 deg yaw, giving ~29 px at 85 %
  fill on a 360 px screen. Resolved by cover framing: room >= 1.0 of viewport width,
  camera closes in until Chris is 46 px, and trails the player across the walkable floor.
- Tasks 3/4/5 ran before 2/6 because the shell had to exist before the camera could be
  solved against it.
