// The chart as a standalone SVG file: the page's component, rendered once
// with fixed colours.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { VersionPoint } from "../../src/improvement/series";
import { EXPORT_PALETTE, ImprovementChart } from "./improvement-chart";

export const chartSvg = (versions: VersionPoint[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(createElement(ImprovementChart, { versions, palette: EXPORT_PALETTE }))}\n`;
