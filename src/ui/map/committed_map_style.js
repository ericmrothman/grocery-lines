export const COMMITTED_MAP_STYLE = {
  "name": "clean-05",
  "description": "Editorial Slate: silent deep charcoal ground, ghostly bus wireframe, crisp diamond pins, and calibrated luminous amber ramp.",
  "surface": {
    "shape": "hex",
    "size": 1.05,
    "hexFromZoom": 0,
    "livedInOnly": true,
    "sizeByHomes": false,
    "homesFloor": 0.05,
    "gappedSize": 0.8,
    "glow": 0,
    "opacity": 0.85,
    "opacityUnderTrip": 0.6,
    "ghost": {
      "visible": false,
      "size": 0.22,
      "opacity": 0.5
    }
  },
  "basemap": {
    "labels": false,
    "landuse": false,
    "water": false,
    "buildings": false,
    "roads": "none",
    "roadWidthScale": 1,
    "roadOpacity": 1,
    "roadsAboveCells": false,
    "labelHaloPx": 2,
    "font": "Inter"
  },
  "lines": {
    "countyPx": 0.75,
    "busNetworkPx": 0.75,
    "busNetworkOpacity": 0.22,
    "busNetworkColors": "single",
    "startCellPx": 2,
    "startCellEdgeShade": 0.6,
    "highNeed": {
      "lineWidthPx": 1.5,
      "casingWidthPx": 0
    },
    "lila": {
      "lineWidthPx": 1,
      "fillOpacity": 0.22
    }
  },
  "pins": {
    "sizePx": 3.5,
    "selectedSizePx": 7
  },
  "routes": {
    "walkPx": 4,
    "busPx": 5,
    "carPx": 5,
    "casingPx": 2,
    "otherWayOpacity": 0.85,
    "walkDash": [
      2,
      5
    ]
  },
  "palettes": {
    "light": {
      "basemap": "dark",
      "ground": "#101418",
      "roadColor": null,
      "labelHalo": "#101418",
      "ramp": [
        "#566a7d",
        "#8c9ba8",
        "#e5a93c",
        "#f5cf68",
        "#fff2a8"
      ],
      "ghost": "#222a33",
      "countyLine": "#334155",
      "busNetwork": "#ffffff",
      "highNeed": "#e2e8f0",
      "highNeedCasing": "rgb(15 23 42 / 0.8)",
      "lila": "#ef4444",
      "selected": "#38bdf8",
      "startCellFallback": "#1e293b",
      "car": "#fb7185",
      "bus": "#60a5fa",
      "walk": "#c084fc",
      "pinSupermarket": "#f8fafc",
      "pinPantry": "#99f6e4",
      "pinOther": "#64748b",
      "pinEdge": "#0f172a",
      "start": "#38bdf8",
      "startInk": "#0f172a"
    },
    "dark": {
      "basemap": "dark",
      "ground": "#101418",
      "roadColor": null,
      "labelHalo": "#101418",
      "ramp": [
        "#566a7d",
        "#8c9ba8",
        "#e5a93c",
        "#f5cf68",
        "#fff2a8"
      ],
      "ghost": "#222a33",
      "countyLine": "#334155",
      "busNetwork": "#ffffff",
      "highNeed": "#e2e8f0",
      "highNeedCasing": "rgb(15 23 42 / 0.8)",
      "lila": "#ef4444",
      "selected": "#38bdf8",
      "startCellFallback": "#1e293b",
      "car": "#fb7185",
      "bus": "#60a5fa",
      "walk": "#c084fc",
      "pinSupermarket": "#f8fafc",
      "pinPantry": "#99f6e4",
      "pinOther": "#64748b",
      "pinEdge": "#0f172a",
      "start": "#38bdf8",
      "startInk": "#0f172a"
    }
  }
};
