# Design and frontend skills

Copied from each project's own GitHub repository at the commit below, reviewed before adding.
To update one, copy its folder again from a newer commit and change the line here.

| Skill(s) | Source | Commit |
|---|---|---|
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `.claude/skills/impeccable` | `687bc381` |
| `design-taste-frontend` (Taste) | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/taste-skill` | `f6b76575f949707b4e3c37cd86cb44b0b98643e8` |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) `.claude/skills/ui-ux-pro-max` (without its tests) | `b7d5353e` |
| `emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `animation-vocabulary`, `animation-performance`, `choreograph`, `remove-animations` | [emilkowalski/skills](https://github.com/emilkowalski/skills) `skills/` | `c8a79627` |
| `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-utils`, `gsap-react`, `gsap-frameworks`, `gsap-performance` | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) `skills/` (official) | `aed9cfd3` |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) `skills/frontend-design` (official) | `2c5958ec` |

Notes:
- **Taste is not committed** (40 MB, mostly photos). The cloud environment's setup script
  downloads it into `.claude/skills/design-taste-frontend/` at the commit above. Elsewhere, run:
  `git clone https://github.com/Leonxlnx/taste-skill /tmp/taste && git -C /tmp/taste checkout f6b76575f949707b4e3c37cd86cb44b0b98643e8 && cp -R /tmp/taste/skills/taste-skill .claude/skills/design-taste-frontend`
- Impeccable's optional always-on hooks (a check after every edit) are not installed; the skill
  works without them. Its engine binary is downloaded on first use and checked against
  `impeccable/scripts/engine-checksums.txt`.
- Left out as not for this app: Emil's Swift/Expo/native skills, UI UX Pro Max's banner, brand
  and slides skills, and Anthropic's non-frontend skills.
- Taste is built for marketing websites; for Ember's app screens, Impeccable, UI UX Pro Max and
  Emil's skills fit better.
