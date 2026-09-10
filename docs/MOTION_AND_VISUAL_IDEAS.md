# Penn KDSAP motion and visual directions

These concepts use the chapter’s real photography and operational content as the visual system. Motion should clarify the page, never delay access to information, and always stop when a visitor requests reduced motion.

## Implemented in the homepage foundation

### Fieldwork photo reel

A slow horizontal filmstrip brings the archive into the main journey and alternates portrait and landscape crops. It pauses on hover or keyboard focus and becomes a static strip under reduced motion.

### Layered hero depth

The opening photograph moves a few pixels more slowly than the page while scrolling. The movement is deliberately shallow so the headline remains stable and readable.

### Section arrival

Major sections fade upward once as they enter the viewport. The site remains fully visible without JavaScript and when reduced motion is enabled.

### Responsive fixed header

The transparent header settles into Penn blue after the visitor leaves the top of the page, preserving navigation contrast over every section.

### Impact field

Four verified chapter metrics use oversized editorial numerals and a restrained staggered entrance. The reporting period stays beside the heading, and the static values remain in the HTML for accessibility and reduced-motion visitors.

### Screening-site map

A lightweight, dependency-free map plots the six sites named in the 2023–24 chapter recap. Numbered pins and the adjacent site list respond together on hover, focus, and click, while names, addresses, dates, positions, and accessible labels remain editable in Pages CMS.

### Quick calendar

The homepage agenda accepts CMS-managed event cards and shows an intentional empty state when no future public dates have been confirmed. It links to the complete Events page and never exposes the private member calendar.

## Strong next candidates

### Screening journey line

On the Screenings page, a single line can travel through the stages of a visit as the reader scrolls: welcome, health measures, education, physician consultation, and next steps. Each stage should use a real image and CMS-editable plain-language description. On mobile and under reduced motion, it becomes a standard vertical timeline.

### Training contact sheet

The Students page can behave like an editorial contact sheet: cards expand from a compact grid into larger photographs with captions about training, service, and committees. The interaction should be click and keyboard driven rather than hover dependent.

### Event date rhythm

The Events page can animate a restrained vertical date rail while upcoming event cards enter beside it. Calendar content stays readable as a normal agenda if JavaScript or the remote feed fails.

### Team mosaic

The Team page can introduce each group through a composited portrait mosaic. On focus or pointer movement, the selected portrait can become full color while neighboring portraits soften. Names, roles, groups, and image descriptions should all come from the People collection.

### Verified impact count-up

CMS-managed chapter metrics can count from zero only after they enter the viewport. The static final value must be present in the HTML, and every number needs an owner, reporting period, and review date before publication.

### Story-to-gallery transition

Selecting a homepage field story can visually carry its photograph into the Gallery page using a shared transition in supporting browsers. Standard navigation remains the fallback, and the transition is disabled for reduced motion.

## Guardrails

- Keep motion short, interruptible, and subordinate to content.
- Never animate urgent, medical, or error messaging.
- Avoid autoplay video and large animation libraries on the static site.
- Preserve keyboard order and visible focus throughout every animated state.
- Use only verified metrics, locations, dates, and health information.
- Test at 390-pixel mobile width and with `prefers-reduced-motion: reduce` before release.
