# Attribution and provenance

Created by **Lucky 7s Melee LLC**, makers of **[LuckyStats.gg](https://LuckyStats.gg)**.
Original overlay detection implementation extracted from Lucky Stats on October 7, 2026,
source revision `bf2eb49309fdccceda4170d2ad92b65db76f5f7d`.

Our code is MIT licensed. Keep the copyright and license notice in copies or
substantial portions. Visible credit linking LuckyStats.gg is appreciated, but
not an additional license condition. Commercial use and forks are welcome.

## Dependencies and references

- `@slippi/slippi-js` 9.1.2 is Project Slippi's parser, licensed
  **LGPL-3.0-or-later**. Its license is separate from this project's MIT license.
  Source and license: https://github.com/project-slippi/slippi-js.
  Dependencies are installed from npm, not vendored into this repository.
- Vite is the MIT-licensed demo development/build tool:
  https://github.com/vitejs/vite.
- State flag offsets follow the Slippi replay specification:
  https://github.com/project-slippi/slippi-wiki/blob/master/SPEC.md.
- Character action-state IDs and special-move classifications reference the
  Melee decompilation's `ft*_MotionState` enums:
  https://github.com/doldecomp/melee/tree/master/src/melee/ft/kinds.
  Projectile IDs reference `src/melee/it/forward.h` in that project.
  Defense detection also references `ftCommon/ftCo_Damage.c` and `ft/fighter.c`.
  This repository contains numeric classifications, not the game's engine code.

No Melee ROM/ISO, emulator, renderer, Nintendo artwork, GameCube button PNGs,
production replay files, Lucky Stats infrastructure, or account credentials
are included. Text input symbols are the default; integrators can provide
an icon renderer with assets they are entitled to distribute.
