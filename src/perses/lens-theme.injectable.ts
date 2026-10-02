import { getInjectable2 } from "@k8slens/injectable";
import { createTheme, type Theme } from "@mui/material";
import { generateChartsTheme, getTheme } from "@perses-dev/components";
import type { PersesChartsTheme } from "@perses-dev/components";
import { computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction } from "mobx";

// The colours and type of the active Lens theme, as the CSS custom properties Lens sets on the
// document. Perses draws its charts with MUI and echarts, which take colours as values, so they
// are read from there and turned into themes of theirs whenever Lens switches theme.

interface LensThemeValues {
  readonly backgroundPrimary: string;
  readonly backgroundSecondary: string;
  readonly backgroundTertiary: string;
  readonly textHighlight: string;
  readonly textDefault: string;
  readonly textMuted: string;
  readonly border: string;
  readonly primary: string;
  readonly critical: string;
  readonly warning: string;
  readonly success: string;
  readonly fontFamily: string;
  readonly monospaceFontFamily: string;
}

const readLensThemeValues = (): LensThemeValues => {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;

  return {
    backgroundPrimary: read("--grey80", "#1f2123"),
    backgroundSecondary: read("--grey100", "#181a1c"),
    backgroundTertiary: read("--grey70", "#26292b"),
    textHighlight: read("--grey10", "#f1f3f5"),
    textDefault: read("--grey20", "#aaacae"),
    textMuted: read("--grey25", "#8a8a86"),
    border: read("--borderFaintColor", "#373a3e"),
    primary: read("--primary", "#3d90ce"),
    critical: read("--colorError", "#ce3933"),
    warning: read("--colorWarning", "#ff9800"),
    success: read("--colorSuccess", "#43a047"),
    fontFamily: read("--font-main", "") || getComputedStyle(document.body).fontFamily,
    monospaceFontFamily: read("--font-monospace", "monospace"),
  };
};

const luminanceOf = (color: string) => {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex.slice(0, 6);
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);

  return Number.isNaN(red) ? 0 : 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export interface LensPersesTheme {
  readonly mode: "light" | "dark";
  readonly values: LensThemeValues;
  readonly muiTheme: Theme;
  readonly chartsTheme: PersesChartsTheme;
}

const toPersesTheme = (values: LensThemeValues): LensPersesTheme => {
  const mode = luminanceOf(values.backgroundPrimary) > 0.5 ? "light" : "dark";

  const muiTheme = createTheme(getTheme(mode, {}, true), {
    palette: {
      mode,
      primary: { main: values.primary },
      error: { main: values.critical },
      warning: { main: values.warning },
      success: { main: values.success },
      background: { default: values.backgroundSecondary, paper: values.backgroundPrimary },
      text: { primary: values.textDefault, secondary: values.textMuted },
      divider: values.border,
    },
    typography: { fontFamily: values.fontFamily },
    shape: { borderRadius: 4 },
  });

  const axis = {
    axisLabel: { color: values.textMuted },
    axisLine: { lineStyle: { color: values.border } },
    splitLine: { lineStyle: { color: values.border, opacity: 1, width: 1 } },
  };

  const chartsTheme = generateChartsTheme(muiTheme, {
    echartsTheme: {
      textStyle: { color: values.textDefault, fontFamily: values.fontFamily },
      timeAxis: axis,
      valueAxis: axis,
      categoryAxis: axis,
      tooltip: {
        backgroundColor: values.backgroundTertiary,
        borderColor: values.border,
        textStyle: { color: values.textHighlight },
      },
    } as PersesChartsTheme["echartsTheme"],
  });

  return { mode, values, muiTheme, chartsTheme };
};

export const lensPersesThemeInjectable = getInjectable2({
  id: "lens-glance-lens-perses-theme",

  instantiate: () => {
    const values = observable.box(readLensThemeValues(), { deep: false });
    const reread = () => {
      const next = readLensThemeValues();

      if (JSON.stringify(next) !== JSON.stringify(values.get())) {
        runInAction(() => values.set(next));
      }
    };

    // Lens switches theme by changing what the document's custom properties are, through
    // attributes high in the document or the style sheets in its head, so either is a cue to
    // read them again, for as long as something is showing a dashboard.
    const observer = new MutationObserver(reread);

    onBecomeObserved(values, () => {
      reread();
      observer.observe(document.documentElement, { attributes: true });
      observer.observe(document.body, { attributes: true });
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    });
    onBecomeUnobserved(values, () => observer.disconnect());

    const theme = computed(() => toPersesTheme(values.get()));

    return () => theme;
  },
});
