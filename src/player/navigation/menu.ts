import { Shuffle, Repeat, Clicker, BACKLIGHT_MODES } from "../settings/options.ts";
import { songsByIds, tracksOf } from "../catalog/queries.ts";
import type { BacklightMode } from "../settings/options.ts";
import type { CatalogData, Song, TrackKind } from "../catalog/types.ts";
import type { I18n } from "../i18n.ts";

export type { TrackKind } from "../catalog/types.ts";

const PLAYABLE_TARGETS: readonly string[] = ["songs", "playlist-tracks", "artist-tracks"];

const SHUFFLE_VALUES = Object.values(Shuffle);
const REPEAT_VALUES = Object.values(Repeat);
const CLICKER_VALUES = Object.values(Clicker);

const ABOUT_SELECT_HOLD_MS = 5000;

export type ScreenView = "list" | "now-playing" | "brick";

export type ScreenKey =
  | "main"
  | "settings"
  | "about"
  | "backlight"
  | "reset-settings"
  | "playlists"
  | "artists"
  | "songs"
  | "playlist-tracks"
  | "artist-tracks"
  | "now-playing"
  | "brick";

export interface ScreenRef {
  key: string;
  contextId?: string;
  titleKey?: string;
}

export type ToggleKey = "shuffle" | "repeat" | "clicker";

export type MenuAction =
  | "navigate"
  | "inline-toggle"
  | "toggle"
  | "play"
  | "info"
  | "cancel"
  | "reset-all";

interface MenuItemBase {
  id: string;
  title: string;
}

export interface NavigateItem extends MenuItemBase {
  action: "navigate";
  target: ScreenKey;
  contextId?: string;
  screenTitleKey?: string;
}

export interface ToggleItem extends MenuItemBase {
  action: "inline-toggle";
  toggleKey: ToggleKey;
  values: readonly string[];
}

export interface ValueItem extends MenuItemBase {
  action: "toggle";
  target: BacklightMode;
}

export interface PlayItem extends MenuItemBase {
  action: "play";
  songId: string;
}

export interface InfoItem extends MenuItemBase {
  action: "info";
  centered?: boolean;
  value?: string;
}

export interface CancelItem extends MenuItemBase {
  action: "cancel";
}

export interface ResetItem extends MenuItemBase {
  action: "reset-all";
}

export type MenuItem =
  | NavigateItem
  | ToggleItem
  | ValueItem
  | PlayItem
  | InfoItem
  | CancelItem
  | ResetItem;

export interface TrackIdentity {
  readonly id: string;
}

export interface PlaybackQueueState {
  queue: readonly TrackIdentity[];
  currentTrackIndex: number;
}

export interface MenuItemIdentity {
  readonly id?: string;
}

export interface ScreenTitleContext {
  data?: CatalogData;
  contextId?: string;
}

export interface ItemsContext extends ScreenTitleContext {
  hasNowPlaying?: boolean;
  i18n: I18n;
}

export type ItemsBuilder = (ctx: ItemsContext) => MenuItem[];

export interface SelectHold {
  ms: number;
  target: ScreenKey;
}

export interface ScreenDefinition {
  view: ScreenView;
  titleKey?: string;
  title?: (ctx: ScreenTitleContext) => string | undefined;
  items?: ItemsBuilder;
  listsNowPlaying?: boolean;
  selectHold?: SelectHold;
  forgetsSelection?: boolean;
  blocksIdleJump?: boolean;
}

function navigateItem(key: ScreenKey, i18n: I18n): NavigateItem {
  return {
    id: key,
    title: i18n.t(SCREENS[key].titleKey ?? ""),
    action: "navigate",
    target: key,
  };
}

function toggleItem(id: ToggleKey, title: string, values: readonly string[]): ToggleItem {
  return { id, title, action: "inline-toggle", toggleKey: id, values };
}

function valueItem(mode: BacklightMode, title: string): ValueItem {
  return { id: mode, title, action: "toggle", target: mode };
}

function emptyItems(i18n: I18n): MenuItem[] {
  return [
    {
      id: "no-music",
      title: i18n.t("ASE.Web.M8541.Menu.NoMusic"),
      action: "info",
      centered: true,
    },
  ];
}

function orEmpty(items: MenuItem[], i18n: I18n): MenuItem[] {
  return items.length ? items : emptyItems(i18n);
}

function tracksBuilder(kind: TrackKind): ItemsBuilder {
  return ({ data, contextId, i18n }: ItemsContext) => {
    if (!data) return emptyItems(i18n);
    const items: MenuItem[] = tracksOf(kind, contextId, data).map((song: Song) => ({
      id: song.id,
      title: song.name,
      action: "play",
      songId: song.id,
    }));
    return orEmpty(items, i18n);
  };
}

function mainItems({ i18n, hasNowPlaying }: ItemsContext): MenuItem[] {
  return [
    navigateItem("playlists", i18n),
    navigateItem("artists", i18n),
    navigateItem("songs", i18n),
    navigateItem("settings", i18n),
    ...(hasNowPlaying ? [navigateItem("now-playing", i18n)] : []),
  ];
}

function settingsItems({ i18n }: ItemsContext): MenuItem[] {
  return [
    navigateItem("about", i18n),
    toggleItem("shuffle", i18n.t("ASE.Web.M8541.Settings.Shuffle"), SHUFFLE_VALUES),
    toggleItem("repeat", i18n.t("ASE.Web.M8541.Settings.Repeat"), REPEAT_VALUES),
    navigateItem("backlight", i18n),
    toggleItem("clicker", i18n.t("ASE.Web.M8541.Settings.Clicker"), CLICKER_VALUES),
    navigateItem("reset-settings", i18n),
  ];
}

function aboutItems({ data, i18n }: ItemsContext): MenuItem[] {
  const formatGB = (value: number) => i18n.formatNumber(value, { style: "unit", unit: "gigabyte" });
  return [
    { id: "m8541", title: "M8541", action: "info", centered: true },
    {
      id: "songs-count",
      title: i18n.t("ASE.Web.M8541.About.Songs"),
      action: "info",
      value: i18n.formatNumber(data?.songs.length ?? 0),
    },
    {
      id: "capacity",
      title: i18n.t("ASE.Web.M8541.About.Capacity"),
      action: "info",
      value: formatGB(9.2),
    },
    {
      id: "available",
      title: i18n.t("ASE.Web.M8541.About.Available"),
      action: "info",
      value: formatGB(4.5),
    },
    {
      id: "version",
      title: i18n.t("ASE.Web.M8541.About.Version"),
      action: "info",
      value: "2644.1.0",
    },
  ];
}

function backlightItems({ i18n }: ItemsContext): MenuItem[] {
  return BACKLIGHT_MODES.map(({ mode, labelKey }) => valueItem(mode, i18n.t(labelKey)));
}

function resetItems({ i18n }: ItemsContext): MenuItem[] {
  return [
    {
      id: "cancel",
      title: i18n.t("ASE.Web.M8541.Reset.Cancel"),
      action: "cancel",
    },
    {
      id: "reset-all",
      title: i18n.t("ASE.Web.M8541.Reset.Reset"),
      action: "reset-all",
    },
  ];
}

function playlistItems({ data, i18n }: ItemsContext): MenuItem[] {
  const items: MenuItem[] = (data?.playlists ?? []).map((playlist) => ({
    id: playlist.id,
    title: playlist.name,
    action: "navigate",
    target: "playlist-tracks",
    contextId: playlist.id,
  }));
  return orEmpty(items, i18n);
}

function artistItems({ data, i18n }: ItemsContext): MenuItem[] {
  const items: MenuItem[] = (data?.artists ?? []).map((artist) => ({
    id: artist.id,
    title: artist.name,
    action: "navigate",
    target: "artist-tracks",
    contextId: artist.id,
  }));
  if (items.length && data?.songs.length) {
    items.unshift({
      id: "all",
      title: i18n.t("ASE.Web.M8541.Menu.All"),
      action: "navigate",
      target: "songs",
      screenTitleKey: "ASE.Web.M8541.Menu.AllSongs",
    });
  }
  return orEmpty(items, i18n);
}

export const SCREENS: Record<ScreenKey, ScreenDefinition> = {
  main: {
    view: "list",
    title: () => "M8541",
    items: mainItems,
    listsNowPlaying: true,
  },
  settings: {
    view: "list",
    titleKey: "ASE.Web.M8541.Menu.Settings",
    items: settingsItems,
  },
  about: {
    view: "list",
    titleKey: "ASE.Web.M8541.Settings.About",
    items: aboutItems,
    selectHold: { ms: ABOUT_SELECT_HOLD_MS, target: "brick" },
  },
  backlight: {
    view: "list",
    titleKey: "ASE.Web.M8541.Settings.BacklightTimer",
    items: backlightItems,
  },
  "reset-settings": {
    view: "list",
    titleKey: "ASE.Web.M8541.Settings.ResetAllSettings",
    items: resetItems,
    forgetsSelection: true,
  },
  playlists: {
    view: "list",
    titleKey: "ASE.Web.M8541.Menu.Playlists",
    items: playlistItems,
  },
  artists: {
    view: "list",
    titleKey: "ASE.Web.M8541.Menu.Artists",
    items: artistItems,
  },
  songs: {
    view: "list",
    titleKey: "ASE.Web.M8541.Menu.Songs",
    items: tracksBuilder("songs"),
  },
  "playlist-tracks": {
    view: "list",
    titleKey: "ASE.Web.M8541.Menu.Playlists",
    title: ({ data, contextId }) =>
      data?.playlists.find((playlist) => playlist.id === contextId)?.name,
    items: tracksBuilder("playlist-tracks"),
  },
  "artist-tracks": {
    view: "list",
    titleKey: "ASE.Web.M8541.Menu.Artists",
    title: ({ data, contextId }) => data?.artists.find((artist) => artist.id === contextId)?.name,
    items: tracksBuilder("artist-tracks"),
  },
  "now-playing": {
    view: "now-playing",
    titleKey: "ASE.Web.M8541.Menu.NowPlaying",
    blocksIdleJump: true,
  },
  brick: {
    view: "brick",
    titleKey: "ASE.Web.M8541.Game.Title",
    blocksIdleJump: true,
  },
};

export function screenByKey(key: string): ScreenDefinition {
  return SCREENS[key as ScreenKey];
}

export function itemsFor(screen: ScreenRef, ctx: ItemsContext): MenuItem[] {
  return screenByKey(screen.key).items?.({ ...ctx, contextId: screen.contextId }) ?? [];
}

export function listsNowPlaying(key: string, hasNowPlaying: boolean): boolean {
  return hasNowPlaying && !!screenByKey(key).listsNowPlaying;
}

export function titleFor(screen: ScreenRef, data: CatalogData | undefined, i18n: I18n): string {
  if (screen.titleKey) return i18n.t(screen.titleKey);
  const definition = screenByKey(screen.key);
  const custom = definition.title?.({ data, contextId: screen.contextId });
  if (custom !== undefined) return custom;
  return definition.titleKey ? i18n.t(definition.titleKey) : "";
}

export function stackTop<T extends ScreenRef>(stack: readonly T[]): T {
  return stack[stack.length - 1];
}

export function nowPlayingScreen(): ScreenRef {
  return { key: "now-playing" };
}

export function isPlayableTarget(target: string): boolean {
  return PLAYABLE_TARGETS.includes(target);
}

export function playableItems(items: readonly MenuItem[]): PlayItem[] {
  return items.filter((item): item is PlayItem => item.action === "play");
}

export function queueFor(items: readonly MenuItem[], data: CatalogData): Song[] {
  return songsByIds(
    playableItems(items).map((item) => item.songId),
    data,
  );
}

function queueMatches(songIds: readonly string[], queue: readonly TrackIdentity[]): boolean {
  return (
    songIds.length > 0 &&
    songIds.length === queue.length &&
    songIds.every((songId, index) => songId === queue[index]?.id)
  );
}

export function queueIndexFor(items: readonly MenuItem[], playback: PlaybackQueueState): number {
  const songs = playableItems(items);
  const { queue, currentTrackIndex } = playback;
  return queueMatches(
    songs.map((item) => item.songId),
    queue,
  )
    ? items.indexOf(songs[currentTrackIndex])
    : -1;
}
