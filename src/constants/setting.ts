export interface slideElementOptions {
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  verticalAlign?: 0 | 1 | 2; // 0: top, 1: middle, 2: bottom
  horizontalAlign?: 0 | 1 | 2; // 0: left, 1: center, 2: right
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  hidden?: boolean;
}

export const EXPORT_OPTIONS_DEFAULT = {
  includeCurrentArrangement: true,
  includeDefaultArrangement: true,
  includeTitleSlide: true,
  addBlankSlideBeforeTitle: true,
  includeLanguage2: true,
};

export const EXPORT_TEMPLATE_DEFAULT: {
  language1: slideElementOptions;
  language2: slideElementOptions;
  title1: slideElementOptions;
  title2: slideElementOptions;
  title3: slideElementOptions;
} = {
  language1: {
    name: "Lang1",
    x: 0,
    y: 0,
    width: 1920,
    height: 540,
    verticalAlign: 2,
    horizontalAlign: 1,
    fontSize: 104,
    fontFamily: "Noto Sans TC",
    fontWeight: "bold",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
  },
  language2: {
    name: "Lang2",
    x: 0,
    y: 540,
    width: 1920,
    height: 540,
    verticalAlign: 0,
    horizontalAlign: 1,
    fontSize: 48,
    fontFamily: "Noto Sans TC",
    fontWeight: "bold",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
  },
  title1: {
    name: "Title1",
    x: 0,
    y: 0,
    width: 1920,
    height: 540,
    verticalAlign: 2,
    horizontalAlign: 1,
    fontSize: 120,
    fontFamily: "Noto Sans TC",
    fontWeight: "bold",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
  },
  title2: {
    name: "Title2",
    x: 0,
    y: 540,
    width: 1920,
    height: 540,
    verticalAlign: 0,
    horizontalAlign: 1,
    fontSize: 56,
    fontFamily: "Noto Sans TC",
    fontWeight: "bold",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
  },
  title3: {
    name: "Title3",
    x: 0,
    y: 1080,
    width: 1920,
    height: 540,
    verticalAlign: 1,
    horizontalAlign: 1,
    fontSize: 56,
    fontFamily: "Noto Sans TC",
    fontWeight: "bold",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
    hidden: true,
  },
};
