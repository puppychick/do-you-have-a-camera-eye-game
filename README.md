# Do You Have a Camera Eye?

A browser game for photography beginners. Each level is one crowded photo, and the player crops a better shot out of it with a viewfinder. After each shot, the game scores the composition and color and explains the score in plain language.

## The idea

I wanted beginners to practice *seeing* a good shot inside a messy scene, the way you do when you raise a camera on the street. All the photos are my own, taken in Uzbekistan. The game should feel like looking through a viewfinder, and its feedback should read like a teacher's red grease-pencil marks on a print, not like a grade.

**When someone** moves and resizes the viewfinder over a crowded photo and presses Shoot, **the experience should** show them, with marks drawn on the photo and a few plain sentences, why their crop works or doesn't, so they can try again with a better eye.

## How to open it

Download or clone this repository, then double-click `index.html`. Nothing needs to be installed, and it works offline (only the fonts need the internet; without it, the page uses fallback fonts).

**How to play**

- Drag the viewfinder to move it, pull its corners or sides to resize it, or drag across the dark area to draw a new frame.
- Pick a frame shape (Free, 1:1, 4:5, 3:2, 16:9, 9:16) if you want one.
- Press **Shoot**. Press **Try again** to adjust the same frame, or pick another photo from the strip at the top.
- Keyboard: arrow keys move the frame, + and − resize it, Enter shoots.

## How the scoring works

The total score is 70% composition and 30% color. 85 or more earns three stars.

**Composition** uses hand-marked data for each photo (`data/photos.js`): the main subject, other subjects, distractions, and the horizon. Each photo has its own rule:

- **Rule of thirds**: the street, the back seat, the carved column, the bedroom.
- **Symmetry**: the golden dome, the star ceiling, the brick portal, the pink muqarnas.
- **Fill the frame**: the blue muqarnas.

The game checks whether the subject lands on a third line (or on the symmetry line), whether it is cut off by an edge, which distractions are inside the frame, and where the horizon falls.

**Color** is read from the pixels inside the frame. Pixels are converted to OKLCH, grays are set aside, and the remaining hues are compared with color-harmony templates (the hue templates used in Cohen-Or et al., 2006, *Color Harmonization*). The game also ranks the player's colors against 160 random crops of the same photo, because a photo's colors are mostly decided when it is taken, not when it is cropped.

## AI tool and selected prompts

I used **Claude** (Anthropic) in the claude.ai chat. Claude wrote most of the code; I described the idea, chose the photos, tested the game, and decided which suggestions to keep.

1. **My first description**, which turned out not to be what I wanted:
   > "The screen shows a camera viewfinder with a simple subject (a person silhouette looking to the left). The user moves the subject with a slider or by dragging. When they press a 'Shoot' button, a rule-of-thirds grid appears on top, and the page gives short feedback on their composition. … Before writing code, tell me how you plan to decide what counts as good composition."

2. **Redirecting the idea** after seeing the first version. I rewrote the brief around cropping a real, cluttered photo, asked Claude to explain its plan before coding, and uploaded my photos:
   > "Before coding, explain: how you would calculate the color score, what its weaknesses might be, and how I should format my hand-marked points." … 你听我说，我要的是在一张照片中裁切。你用这几张照片吧
   >
   > *(Listen: what I want is cropping inside one photo. Use these photos.)*

3. **Deciding about the collages.** Two of my images were collages (of 3 and 4 photos). Claude asked whether I had the originals; I decided:
   > 把拼图切开用。 *(Split the collages and use them.)*

4. **Reporting a failure.** I sent a screenshot of the browser error, then a screenshot of the Terminal window:
   > 什么情况 *(What's going on?)*

## What I tested and changed

1. **The idea itself.** Claude first built exactly what I described: a silhouette moved with a slider. Seeing it made me realize that the skill I wanted to train is finding a shot inside a messy scene, so I switched to cropping real photos.
2. **One rule per photo** (Claude's suggestion, which I accepted). Most of my photos are symmetrical architecture. Scoring them with the rule of thirds would punish the classic centered shot, so each photo names its own rule.
3. **Splitting the collages.** A viewfinder that crosses two photos in a collage makes no sense, so the two collages became seven separate levels, nine photos in total.
4. **Making the color score meaningful.** In the first version, almost every crop of every photo scored 96–100 on color, because the loosest harmony templates (two broad, opposite groups of colors) fit nearly any photo. The fix: loose templates earn less credit, neighboring hues such as gold and orange count as one group before checking whether colors compete, and mostly gray crops are judged by their range from dark to light. Now the color score changes with the crop: in Claude's test of 200 random crops per photo, most photos range over 25–35 points (for example, about 42–93 on the star ceiling), but the brick portal still only ranges from about 89 to 96, so there the color score barely tells crops apart.
5. **Starting frames** (caught in Claude's automated test, not by me). The default centered frame already earned three stars on three photos, so there was nothing left to fix. Each photo now starts with a random frame that scores under 60.
6. **The game wouldn't open on my Mac.** The first version had to run through a small local server. When I opened it, the browser showed `ERR_CONNECTION_REFUSED`. The Terminal showed that my Mac had no working `python3`, so the server never started. Instead of installing developer tools, we removed the need for a server: the photo data became a `.js` file, and color is read from small copies of each photo stored in `data/color-grids.js`. Browsers block reading the pixels of photos opened from disk, but they allow it for these embedded copies. After the fix, I opened it again by double-clicking `index.html`, and it worked.

7. **My own playtest.** When I played the game myself, its scores often didn't match my own standards. My favorite photo is the one from the back seat of a car: the backlight and the sun flare through the windshield are what make it beautiful to me, and the hanging cord and the car interior feel like part of the scene. The game sees it differently. My original framing, the whole photo, scored only 36 for composition: the game counted the sun flare as a "blown-out" distraction (a mark Claude made when it estimated the data), along with the dark seat edge and the phone on the dashboard, and said the driver is off the grid. I disagree that the flare is a distraction, so I removed that mark from `data/photos.js` and shot the same whole-photo framing again. It now scores 52. The other deductions remain (the driver off the grid, the seat edge, the phone), and removing the mark only stops the game from punishing the light; it still has no way to reward it. For me, a good photo also needs a human feeling (人文感): the sense of people, everyday life and atmosphere in the frame. The game mostly rewards measurable composition rules like the rule of thirds, so its idea of a good shot is narrower than mine.

## Reflection

The core interaction works as intended: I can drag and resize a viewfinder over a real photo, press Shoot, and see red marks on the photo together with a short explanation of the score. What didn't match my intention at first was the project itself. My first prompt described a silhouette on a slider, and Claude built exactly that; only after seeing it did I understand that what I wanted was cropping inside a real, cluttered photo, so I rewrote the brief and brought in my own photos. The biggest failure came when I opened the game myself and got `ERR_CONNECTION_REFUSED`. By sending the browser error and then the Terminal output, we traced it to a missing `python3` on my Mac, and the fix was to change how the game is built rather than to change my computer. Playing it myself, I also found that the scores often disagreed with my own judgment: my favorite photo, taken from the back seat of a car, scored only 36 for composition in its original framing, partly because the game treated its sun flare, the light I love in it, as a distraction. I removed that mark and the score rose to 52, but the game can only stop punishing the light, not recognize it. I think the human feeling of a photo (人文感) matters as much as its geometry, but the scoring focuses on the rule of thirds and other composition rules. Looking back, that is also what my own brief asked for: I defined "good" as thirds, distractions, edges and color, and the game measures exactly that, and nothing more.

Claude wrote most of the code and proposed ideas I had to judge: scoring symmetrical buildings by symmetry instead of the rule of thirds, splitting my collages (I chose to split them rather than look for the originals), and a color score built on harmony templates. The color score is the part I had to understand most carefully, because its first version gave almost every crop 96–100 and so told the player nothing. Several things remain unresolved. Most importantly, the game has no way to measure the human feeling I care about, so a technically "correct" crop can still score higher than one I find more meaningful. Color "harmony" is subjective too, so any formula for it is only one opinion. The hand marks were estimated by eye against a grid, so the boxes around subjects and distractions are approximate; marking mode (`index.html?mark`) lets me correct them. And in the street photo, a hanging cord sits in front of the main car, so no crop can avoid it; I left it unmarked rather than punish every shot.

## Project files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page and styles |
| `js/composition.js` | Composition scoring (logic only) |
| `js/color.js` | Color scoring (logic only) |
| `js/game.js` | Viewfinder, shooting, results |
| `js/marker.js` | Marking mode |
| `data/photos.js` | Hand-marked data for each photo |
| `data/color-grids.js` | Small copies of each photo, used to read colors |
| `images/` | Photos (2400 px long edge) and thumbnails |

**Marking mode.** Add `?mark` after `index.html` in the address bar. Pick a tool, drag on the photo, edit labels and weights, then click "Copy this photo's data" and replace that photo's entry in `data/photos.js`.

- `rule`: `"thirds"`, `"center"` (with `axis`, the x position of the symmetry line) or `"fill"` (with `pattern`, the area the frame must stay inside).
- `subjects`: `box` is `[left, top, width, height]`; `anchor` is the point that should land on a third line; `main: true` marks the main subject; `cropOK: true` means cutting it is fine.
- `distractions`: `weight` 1–3 says how strongly it pulls the eye.
- `horizon`: two end points `[x1, y1, x2, y2]`; leave it out if there is none.
- All coordinates are fractions from 0 to 1, with (0, 0) at the top left.

**Adding a photo.** Put the image in `images/`, add an entry to `data/photos.js` with a new `id`, then use "Color data for a new photo" at the bottom of marking mode and paste the copied line into `data/color-grids.js`. Without that line, the photo is scored on composition only.

**Tuning.** Composition thresholds are in `TUNING` at the top of `js/composition.js`, color thresholds at the top of `js/color.js`, and the 70/30 weights, star thresholds and minimum frame size at the top of `js/game.js`.
