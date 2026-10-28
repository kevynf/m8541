const DEFAULT_LOCALE = "en-US";

export type I18nParams = Record<string, string | number>;

export interface HostI18n {
  t(key: string, params?: I18nParams): string | undefined;
}

export interface I18n {
  t(key: string, params?: I18nParams): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatList(values: readonly string[]): string;
}

export function canonicalLocale(locale: string | undefined): string {
  if (!locale) return DEFAULT_LOCALE;
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    console.warn(`Invalid language "${locale}"; using ${DEFAULT_LOCALE}`);
    return DEFAULT_LOCALE;
  }
}

function interpolate(str: string, params?: I18nParams): string {
  return params
    ? str.replace(/@@(\w+)@@/g, (m, key: string) => (key in params ? String(params[key]) : m))
    : str;
}

const strings: Record<string, string> = {
  "ASE.Web.M8541.Menu.Playlists": "Playlists",
  "ASE.Web.M8541.Menu.Artists": "Artists",
  "ASE.Web.M8541.Menu.Songs": "Songs",
  "ASE.Web.M8541.Menu.Settings": "Settings",
  "ASE.Web.M8541.Menu.NowPlaying": "Now Playing",
  "ASE.Web.M8541.Menu.All": "All",
  "ASE.Web.M8541.Menu.AllSongs": "All Songs",
  "ASE.Web.M8541.Menu.NoMusic": "No Music",
  "ASE.Web.M8541.Settings.About": "About",
  "ASE.Web.M8541.Settings.Shuffle": "Shuffle",
  "ASE.Web.M8541.Settings.Repeat": "Repeat",
  "ASE.Web.M8541.Settings.BacklightTimer": "Backlight Timer",
  "ASE.Web.M8541.Settings.Clicker": "Clicker",
  "ASE.Web.M8541.Settings.ResetAllSettings": "Reset All Settings",
  "ASE.Web.M8541.Settings.Value.Off": "Off",
  "ASE.Web.M8541.Settings.Value.On": "On",
  "ASE.Web.M8541.Settings.Value.Songs": "Songs",
  "ASE.Web.M8541.Settings.Value.One": "One",
  "ASE.Web.M8541.Settings.Value.All": "All",
  "ASE.Web.M8541.Backlight.Off": "Off",
  "ASE.Web.M8541.Backlight.OneSecond": "1 Second",
  "ASE.Web.M8541.Backlight.TwoSeconds": "2 Seconds",
  "ASE.Web.M8541.Backlight.ThreeSeconds": "3 Seconds",
  "ASE.Web.M8541.Backlight.FiveSeconds": "5 Seconds",
  "ASE.Web.M8541.Backlight.AlwaysOn": "Always On",
  "ASE.Web.M8541.Reset.Cancel": "Cancel",
  "ASE.Web.M8541.Reset.Reset": "Reset",
  "ASE.Web.M8541.About.Songs": "Songs",
  "ASE.Web.M8541.About.Capacity": "Capacity",
  "ASE.Web.M8541.About.Available": "Available",
  "ASE.Web.M8541.About.Version": "Version",
  "ASE.Web.M8541.NowPlaying.Position": "@@index@@ of @@total@@",
  "ASE.Web.M8541.NowPlaying.ShuffleOn": "Shuffle on",
  "ASE.Web.M8541.NowPlaying.RepeatOne": "Repeat one",
  "ASE.Web.M8541.NowPlaying.RepeatAll": "Repeat all",
  "ASE.Web.M8541.NowPlaying.ShuffleOnRepeatOne": "Shuffle on, Repeat one",
  "ASE.Web.M8541.NowPlaying.ShuffleOnRepeatAll": "Shuffle on, Repeat all",
  "ASE.Web.M8541.NowPlaying.PlaybackProgress": "Playback Progress",
  "ASE.Web.M8541.NowPlaying.Volume": "Volume",
  "ASE.Web.M8541.Wheel.Menu": "Menu",
  "ASE.Web.M8541.Wheel.Back": "Back",
  "ASE.Web.M8541.Wheel.Forward": "Forward",
  "ASE.Web.M8541.Wheel.Play": "Play",
  "ASE.Web.M8541.Wheel.Pause": "Pause",
  "ASE.Web.M8541.Wheel.Select": "Select",
  "ASE.Web.M8541.Game.Title": "Brick",
  "ASE.Web.M8541.Game.GameOver": "GAME OVER",
  "ASE.Web.M8541.Game.LaunchBall": "Press Center to Launch Ball",
  "ASE.Web.M8541.Status.Loading": "Loading",
  "ASE.Web.M8541.Status.Ready": "Ready",
  "ASE.Web.M8541.Error.NotConnected": "You are not connected to the internet",
};

export function createI18n(hostI18n?: HostI18n, locale?: string): I18n {
  const tag = hostI18n ? canonicalLocale(locale) : DEFAULT_LOCALE;
  const numberFormats = new Map<string, Intl.NumberFormat>();
  const listFormat = new Intl.ListFormat(tag, {
    style: "long",
    type: "conjunction",
  });

  return {
    t(key, params) {
      if (hostI18n) {
        try {
          const translated = hostI18n.t(key, params);
          if (translated) return translated;
        } catch (e) {
          console.error(`Host i18n failed for "${key}"`, e);
        }
      }
      const fallback = strings[key];
      if (fallback === undefined) {
        console.warn(`No English default for "${key}"`);
        return `**${key}**`;
      }
      return interpolate(fallback, params);
    },
    formatNumber(value, options) {
      const cacheKey = JSON.stringify(options ?? {});
      let nf = numberFormats.get(cacheKey);
      if (!nf) {
        nf = new Intl.NumberFormat(tag, options);
        numberFormats.set(cacheKey, nf);
      }
      return nf.format(value);
    },
    formatList(values) {
      return listFormat.format(values);
    },
  };
}

export { strings as defaultStrings };
