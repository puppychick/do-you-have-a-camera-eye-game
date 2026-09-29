// Hand-marked data for each photo. Edit it here, or use marking mode (open index.html?mark).
window.CAMERA_EYE_PHOTOS = {
  "photos": [
    {
      "id": "street",
      "title": "Street through the windshield",
      "file": "images/street.jpg",
      "thumb": "images/thumbs/street.jpg",
      "rule": "thirds",
      "subjects": [
        { "label": "silver sedan", "main": true, "box": [0.49, 0.59, 0.125, 0.22], "anchor": [0.555, 0.68] },
        { "label": "HOTEL sign", "box": [0.93, 0.26, 0.06, 0.36] },
        { "label": "black SUV", "box": [0.19, 0.6, 0.165, 0.27] },
        { "label": "white car on the right", "box": [0.645, 0.63, 0.11, 0.16] }
      ],
      "distractions": [
        { "label": "blurry rear-view mirror", "box": [0.36, 0.04, 0.31, 0.26], "weight": 3 },
        { "label": "tinted strip at the top of the windshield", "box": [0, 0, 1, 0.09], "weight": 2 },
        { "label": "steering wheel", "box": [0, 0.7, 0.29, 0.3], "weight": 2 },
        { "label": "dashboard", "box": [0, 0.87, 1, 0.13], "weight": 2 },
        { "label": "phone holder", "box": [0.39, 0.8, 0.09, 0.2], "weight": 2 }
      ],
      "horizon": [0, 0.64, 1, 0.64]
    },
    {
      "id": "back-seat",
      "title": "Back seat",
      "file": "images/back-seat.jpg",
      "thumb": "images/thumbs/back-seat.jpg",
      "rule": "thirds",
      "subjects": [
        { "label": "driver", "main": true, "box": [0.1, 0, 0.22, 0.5], "anchor": [0.22, 0.22], "cropOK": true }
      ],
      "distractions": [
        { "label": "dark seat edge", "box": [0, 0.6, 0.18, 0.4], "weight": 1 },
        { "label": "phone on the dashboard", "box": [0.46, 0.52, 0.06, 0.2], "weight": 1 }
      ]
    },
    {
      "id": "carved-column",
      "title": "Carved column",
      "file": "images/carved-column.jpg",
      "thumb": "images/thumbs/carved-column.jpg",
      "rule": "thirds",
      "subjects": [
        { "label": "carved column", "main": true, "box": [0.5, 0, 0.285, 1], "anchor": [0.64, 0.4], "cropOK": true }
      ],
      "distractions": [
        { "label": "blown-out white sky", "box": [0.845, 0, 0.155, 1], "weight": 2 }
      ]
    },
    {
      "id": "golden-dome",
      "title": "Golden dome",
      "file": "images/golden-dome.jpg",
      "thumb": "images/thumbs/golden-dome.jpg",
      "rule": "center",
      "axis": 0.6,
      "subjects": [
        { "label": "dome and chandelier", "main": true, "box": [0.22, 0, 0.78, 0.47], "anchor": [0.605, 0.28], "cropOK": true }
      ],
      "distractions": [
        { "label": "blank patch in the tile band", "box": [0.6, 0.605, 0.15, 0.06], "weight": 2 },
        { "label": "plain patch on the left wall", "box": [0.01, 0.4, 0.09, 0.07], "weight": 1 },
        { "label": "dark pole", "box": [0.86, 0.78, 0.07, 0.22], "weight": 2 }
      ]
    },
    {
      "id": "star-ceiling",
      "title": "Star ceiling",
      "file": "images/star-ceiling.jpg",
      "thumb": "images/thumbs/star-ceiling.jpg",
      "rule": "center",
      "axis": 0.505,
      "subjects": [
        { "label": "star ceiling", "main": true, "box": [0.12, 0.17, 0.78, 0.63], "anchor": [0.505, 0.39], "cropOK": true }
      ],
      "distractions": [
        { "label": "bright sky at the top", "box": [0, 0, 1, 0.08], "weight": 2 },
        { "label": "carved capital in the corner", "box": [0, 0.78, 0.12, 0.22], "weight": 1 },
        { "label": "carved capital in the corner", "box": [0.86, 0.78, 0.14, 0.22], "weight": 1 }
      ]
    },
    {
      "id": "brick-portal",
      "title": "Brick portal",
      "file": "images/brick-portal.jpg",
      "thumb": "images/thumbs/brick-portal.jpg",
      "rule": "center",
      "axis": 0.4,
      "subjects": [
        { "label": "arched portal", "main": true, "box": [0.08, 0.03, 0.66, 0.97], "anchor": [0.4, 0.38], "cropOK": true }
      ],
      "distractions": [
        { "label": "tree", "box": [0.73, 0.37, 0.27, 0.63], "weight": 2 },
        { "label": "wooden bench", "box": [0.46, 0.9, 0.14, 0.1], "weight": 1 }
      ]
    },
    {
      "id": "pink-muqarnas",
      "title": "Pink muqarnas",
      "file": "images/pink-muqarnas.jpg",
      "thumb": "images/thumbs/pink-muqarnas.jpg",
      "rule": "center",
      "axis": 0.48,
      "subjects": [
        { "label": "muqarnas vault", "main": true, "box": [0.05, 0.02, 0.9, 0.98], "anchor": [0.48, 0.4], "cropOK": true }
      ],
      "distractions": [
        { "label": "tiles from the next wall", "box": [0, 0, 0.1, 0.08], "weight": 1 },
        { "label": "dark window grille", "box": [0.88, 0.88, 0.1, 0.12], "weight": 1 }
      ]
    },
    {
      "id": "blue-muqarnas",
      "title": "Blue muqarnas",
      "file": "images/blue-muqarnas.jpg",
      "thumb": "images/thumbs/blue-muqarnas.jpg",
      "rule": "fill",
      "pattern": [0.2, 0.1, 0.8, 0.9],
      "subjects": [],
      "distractions": [
        { "label": "dark corner", "box": [0, 0.8, 0.12, 0.2], "weight": 1 }
      ]
    },
    {
      "id": "garden-bedroom",
      "title": "Garden bedroom",
      "file": "images/garden-bedroom.jpg",
      "thumb": "images/thumbs/garden-bedroom.jpg",
      "rule": "thirds",
      "subjects": [
        { "label": "bed", "main": true, "box": [0.22, 0.57, 0.78, 0.36], "anchor": [0.72, 0.64], "cropOK": true }
      ],
      "distractions": [
        { "label": "ceiling lamp cut off at the top", "box": [0.26, 0, 0.05, 0.03], "weight": 1 },
        { "label": "heavy dark roof", "box": [0, 0, 1, 0.22], "weight": 1 }
      ]
    }
  ]
};
