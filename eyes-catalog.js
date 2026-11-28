/* EYES 5.3 · The discovery catalog and journal wording (data only, no code paths).

   One file, read by every platform:
     Android launcher + iPhone web app   <script src="eyes-catalog.js">  -> window.EYES_CATALOG
     Linux companion (Python)            eyes_companion/catalog.py parses the JSON between the markers
     a future game                       read the same JSON (docs/DISCOVERY_CATALOG.md)
   Keep the block between the BEGIN/END markers strict JSON (double quotes, no comments, no trailing commas).

   Discovery ids are stable forever ("aquatic.fish.glimmerfin"). Never rename or reuse one: retire it with
   "retired": true instead. New ids, variants and templates may be added in any version (catalog "v" bumps).
   nature: "encountered" (a living thing he met and let be), "found" (an object that came home with him),
           "made" (something he created or grew). commonness: "common" | "uncommon" (wording only: no odds
           are shown and nothing is withheld; "uncommon" items simply turn up less often in the activity). */
'use strict';
(function (root) {
  const CATALOG = /*EYES-CATALOG-BEGIN*/{
  "v": 1,
  "categories": [
    { "id": "aquatic", "label": "Aquatic", "blurb": "Things from the pond of light." },
    { "id": "botanical", "label": "Botanical", "blurb": "Things that grew." },
    { "id": "artifacts", "label": "Artifacts", "blurb": "Things from somewhere else." },
    { "id": "creations", "label": "Creations", "blurb": "Things he made." }
  ],
  "discoveries": {
    "aquatic.fish.glimmerfin":   { "cat": "aquatic", "nature": "encountered", "name": "Glimmerfin", "a": "a glimmerfin", "commonness": "common", "art": "fish", "shape": { "len": 1.0, "fin": 0.6, "round": 0.35 }, "hue": 0, "note": "A quick little fish made of light. Always released back into the pond." },
    "aquatic.fish.ribbontail":   { "cat": "aquatic", "nature": "encountered", "name": "Ribbontail", "a": "a ribbontail", "commonness": "common", "art": "fish", "shape": { "len": 1.25, "fin": 1.0, "round": 0.25 }, "hue": 24, "note": "Long and trailing. It swam off the moment he let go." },
    "aquatic.fish.moonpuff":     { "cat": "aquatic", "nature": "encountered", "name": "Moonpuff", "a": "a moonpuff", "commonness": "uncommon", "art": "fish", "shape": { "len": 0.8, "fin": 0.4, "round": 0.8 }, "hue": -30, "note": "Round as a bubble, and just as surprised." },
    "aquatic.fish.lanternfry":   { "cat": "aquatic", "nature": "encountered", "name": "Lantern fry", "a": "a lantern fry", "commonness": "uncommon", "art": "fish", "shape": { "len": 0.7, "fin": 0.5, "round": 0.45, "lamp": 1 }, "hue": 40, "note": "A tiny fish carrying its own little light." },
    "aquatic.fish.starrykoi":    { "cat": "aquatic", "nature": "encountered", "name": "Starry koi", "a": "a starry koi", "commonness": "uncommon", "art": "fish", "shape": { "len": 1.15, "fin": 0.8, "round": 0.4, "speckle": 1 }, "hue": -60, "note": "Speckled like a night sky. He watched it for a long time after letting it go." },
    "aquatic.oddity.boot":       { "cat": "aquatic", "nature": "found", "name": "Old boot of light", "a": "an old boot of light", "commonness": "common", "art": "boot", "note": "Nobody knows how it got into the pond." },
    "aquatic.oddity.key":        { "cat": "aquatic", "nature": "found", "name": "Pond key", "a": "a key from the pond", "commonness": "common", "art": "key", "note": "Fished up on the end of his line. It opens nothing yet." },
    "aquatic.oddity.shell":      { "cat": "aquatic", "nature": "found", "name": "Pond shell", "a": "a shell from the pond", "commonness": "common", "art": "shell", "note": "Faintly humming, like the pond itself." },
    "aquatic.oddity.star":       { "cat": "aquatic", "nature": "found", "name": "Sunken star", "a": "a star from the bottom of the pond", "commonness": "common", "art": "star", "note": "It must have fallen in." },
    "botanical.flower.starbloom": { "cat": "botanical", "nature": "made", "name": "Starbloom", "a": "a starbloom", "commonness": "common", "art": "flower", "petals": 5, "hue": 0, "note": "Five petals, grown from a seed of his own light." },
    "botanical.flower.moonbell":  { "cat": "botanical", "nature": "made", "name": "Moonbell", "a": "a moonbell", "commonness": "common", "art": "flower", "petals": 6, "hue": -24, "note": "Six soft petals that close a little when he looks away." },
    "botanical.flower.sevenfold": { "cat": "botanical", "nature": "made", "name": "Sevenfold lily", "a": "a sevenfold lily", "commonness": "uncommon", "art": "flower", "petals": 7, "hue": 30, "note": "Seven petals. He counted them twice." },
    "botanical.flower.sunwheel":  { "cat": "botanical", "nature": "made", "name": "Sunwheel", "a": "a sunwheel", "commonness": "uncommon", "art": "flower", "petals": 8, "hue": 48, "note": "Eight petals turning like a little wheel." },
    "botanical.seedpod":          { "cat": "botanical", "nature": "found", "name": "Drifting seed pod", "a": "a drifting seed pod", "commonness": "common", "art": "seedpod", "note": "From the other side of a pocket portal. It hasn't sprouted. Yet." },
    "artifact.crystal":  { "cat": "artifacts", "nature": "found", "name": "Glow crystal", "a": "a glowing crystal", "commonness": "common", "art": "crystal", "note": "Clear and cool, with light moving inside it." },
    "artifact.shell":    { "cat": "artifacts", "nature": "found", "name": "Pearl shell", "a": "a pearl shell", "commonness": "common", "art": "shell", "note": "Iridescent, from a shore he has only visited through a portal." },
    "artifact.key":      { "cat": "artifacts", "nature": "found", "name": "Glowing key", "a": "a glowing key", "commonness": "common", "art": "key", "note": "Small and warm. What it opens is still a mystery." },
    "artifact.feather":  { "cat": "artifacts", "nature": "found", "name": "Light feather", "a": "a feather of light", "commonness": "common", "art": "feather", "note": "From a bird he never saw." },
    "artifact.lantern":  { "cat": "artifacts", "nature": "found", "name": "Tiny lantern", "a": "a tiny lantern", "commonness": "common", "art": "lantern", "note": "Still lit, somehow." },
    "artifact.cube":     { "cat": "artifacts", "nature": "found", "name": "Folded cube", "a": "a folded cube", "commonness": "common", "art": "cube", "note": "It seems larger on the inside." },
    "artifact.ring":     { "cat": "artifacts", "nature": "found", "name": "Halo ring", "a": "a halo ring", "commonness": "common", "art": "ring", "note": "A perfect circle of pale light." },
    "artifact.star":     { "cat": "artifacts", "nature": "found", "name": "Pocket star", "a": "a pocket star", "commonness": "common", "art": "star", "note": "A star small enough to carry home." },
    "creation.tower":    { "cat": "creations", "nature": "made", "name": "Stone tower", "a": "a tower of light stones", "commonness": "common", "art": "tower", "note": "Built stone by stone with his gaze." },
    "creation.drawing.star":          { "cat": "creations", "nature": "made", "name": "Star drawing", "a": "a star", "commonness": "common", "art": "drawing", "shape": "star", "note": "Drawn in the air with a pen of light." },
    "creation.drawing.spiral":        { "cat": "creations", "nature": "made", "name": "Spiral drawing", "a": "a spiral", "commonness": "common", "art": "drawing", "shape": "spiral", "note": "Round and round, until it felt right." },
    "creation.drawing.wave":          { "cat": "creations", "nature": "made", "name": "Wave drawing", "a": "a wave", "commonness": "common", "art": "drawing", "shape": "wave", "note": "Like the pond on a windy day." },
    "creation.drawing.flower":        { "cat": "creations", "nature": "made", "name": "Flower drawing", "a": "a flower", "commonness": "common", "art": "drawing", "shape": "flower", "note": "A flower that never needs watering." },
    "creation.drawing.loop":          { "cat": "creations", "nature": "made", "name": "Loop drawing", "a": "a looping line", "commonness": "common", "art": "drawing", "shape": "loop", "note": "One line, never lifting the pen." },
    "creation.drawing.heart":         { "cat": "creations", "nature": "made", "name": "Heart drawing", "a": "a heart", "commonness": "common", "art": "drawing", "shape": "heart", "note": "He looked at you after drawing this one." },
    "creation.drawing.constellation": { "cat": "creations", "nature": "made", "name": "Constellation", "a": "a constellation", "commonness": "uncommon", "art": "drawing", "shape": "constellation", "note": "Dots of light joined into a picture only he can name." },
    "creation.drawing.portrait":      { "cat": "creations", "nature": "made", "name": "Self-portrait", "a": "a portrait of himself", "commonness": "uncommon", "art": "drawing", "shape": "portrait", "note": "A fair likeness, he thinks." }
  },
  "sources": {
    "fishing":    { "fish": "species", "boot": "aquatic.oddity.boot", "key": "aquatic.oddity.key", "shell": "aquatic.oddity.shell", "star": "aquatic.oddity.star" },
    "gardening":  { "flower": "petals" },
    "building":   { "tower": "creation.tower" },
    "drawing":    { "drawing": "shapes" },
    "expedition": { "crystal": "artifact.crystal", "shell": "artifact.shell", "key": "artifact.key", "feather": "artifact.feather", "seedpod": "botanical.seedpod", "lantern": "artifact.lantern", "cube": "artifact.cube", "ring": "artifact.ring", "star": "artifact.star" }
  },
  "species": [
    { "id": "aquatic.fish.glimmerfin", "w": 40 },
    { "id": "aquatic.fish.ribbontail", "w": 30 },
    { "id": "aquatic.fish.moonpuff", "w": 13 },
    { "id": "aquatic.fish.lanternfry", "w": 11 },
    { "id": "aquatic.fish.starrykoi", "w": 6 }
  ],
  "petals": { "5": "botanical.flower.starbloom", "6": "botanical.flower.moonbell", "7": "botanical.flower.sevenfold", "8": "botanical.flower.sunwheel" },
  "activities": {
    "fishing":       { "label": "Fishing", "family": "hobby", "verb": "fishing" },
    "gardening":     { "label": "Gardening", "family": "hobby", "verb": "gardening" },
    "building":      { "label": "Building", "family": "hobby", "verb": "building" },
    "drawing":       { "label": "Drawing with light", "family": "hobby", "verb": "drawing" },
    "butterflies":   { "label": "Butterflies", "family": "play", "verb": "chasing butterflies" },
    "hide_and_seek": { "label": "Hide-and-seek", "family": "play", "verb": "playing hide-and-seek" },
    "expedition":    { "label": "Pocket expeditions", "family": "expedition", "verb": "exploring pocket portals" },
    "nest":          { "label": "Nesting", "family": "rest", "verb": "napping in a nest" }
  },
  "journal": {
    "first": {
      "encountered": ["Caught his first {name}!", "Met his very first {name}, and let it swim free."],
      "found":       ["Found his first {name}.", "Brought home {a}, the first of its kind."],
      "made":        ["Made his first {name}.", "{A}, the first he ever made."],
      "flower":      ["Grew {a} for the first time.", "Grew his first {name}."],
      "flower.firstever": ["Grew his very first flower: {a}.", "Grew a beautiful flower, his first ever: {a}."],
      "expedition":  ["Returned from somewhere strange carrying {a}, the first of its kind.", "Brought {a} back through a portal, the first he has found."],
      "expedition.firstever": ["Went through a portal for the first time and came back with {a}."]
    },
    "discovery": {
      "fishing.fish":     ["Caught {a}, then let it go.", "Went fishing and met {a}.", "Reeled in {a}. Back into the pond it went."],
      "fishing.oddity":   ["Went fishing and pulled up {a}.", "Fished up {a}. He looked very puzzled, then very proud."],
      "gardening":        ["Grew a beautiful flower: {a}.", "Planted a seed of light. It became {a}."],
      "gardening.revived":["Grew {a}. It drooped once, and he nudged it back up.", "Nursed a wilting sprout into {a}."],
      "building":         ["Built a tower of {stones} stones and stepped back to admire it.", "Stacked {stones} stones into a tower. It held."],
      "drawing":          ["Drew {a} in the air with light.", "Made {a} out of light, then tilted his head at it."],
      "drawing.many":     ["Drew {a} and more in the air with light.", "Filled the air with drawings: {a}, and others."],
      "expedition":       ["Returned from somewhere strange carrying {a}.", "Tumbled out of a pocket portal holding {a}.", "Came back from beyond the shimmer with {a}."]
    },
    "uncommon": ["An uncommon one: {a}.", "Something you don't see every day: {a}."],
    "failed": {
      "fishing.snap":     ["Went fishing. The fish won.", "The line snapped. He sat in the pond light for a while."],
      "fishing.bubble":   ["Waited a long time for a bite. It was a bubble.", "Caught a bubble. It popped."],
      "building":         ["Built a magnificent tower. It lasted approximately three seconds.", "Built a tower of {stones} stones. Gravity disagreed."],
      "expedition":       ["Found a shimmering portal, peeked in, and decided not today.", "Thought about going through a portal. Thought better of it."],
      "any":              ["Tried something new. It didn't quite work out, and that's all right."]
    },
    "completed": {
      "nest":            ["Built a little nest and fell asleep.", "Wove a nest of light and slept for {minutes}."],
      "nest.first":      ["Built his first nest and fell fast asleep."],
      "butterflies":     ["Chased light butterflies. One landed on him; he sneezed.", "Played with butterflies of light, and waved them goodbye."],
      "hide_and_seek":   ["Played hide-and-seek with a shy wisp. Found it after {looks} looks.", "Played hide-and-seek. Got a big fright, then laughed about it."],
      "first":           ["Tried {verb} for the first time."]
    },
    "rest": {
      "favourite": ["Found a favourite place to rest on {device}.", "Decided the {region} of {device} is a good spot for a nap."]
    },
    "visit": {
      "first": ["Visited {device} for the first time.", "Arrived on {device} for the very first time."],
      "summary": ["Spent {duration} on {device}.", "Spent {duration} exploring {device}."]
    }
  },
  "empty": {
    "newborn": "His story is just beginning. Whatever he discovers will be kept here.",
    "older":   "Nothing written yet. When he explores a computer, the moments worth keeping will gather here.",
    "collection": "Nothing collected yet. Fish he meets, flowers he grows and things he brings home will appear here.",
    "keepsakes": "Firsts and special moments will be kept here, however long ago they happened."
  }
}/*EYES-CATALOG-END*/;
  root.EYES_CATALOG = CATALOG;
  if (typeof module === 'object' && module.exports) module.exports = CATALOG;
})(typeof window !== 'undefined' ? window : globalThis);
