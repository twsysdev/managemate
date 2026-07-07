// ─────────────────────────────────────────────────────────────
// ManageMate 共通データ型（フェーズ1で定義。フェーズ2のSupabase設計・
// フェーズ3のAI連携で、この型を基準に read/write を型安全にする）
//
// 注意: 現状のUI本体 components/ManageMateApp.tsx は secretary-app.jsx を
// そのまま移植した単一コンポーネントで、ファイル冒頭に @ts-nocheck を付け
// 型チェックの対象外にしている（フェーズ1は「動く土台」を優先）。
// フェーズ2で分割する際に、下記の型を各コンポーネントへ適用していく。
// ─────────────────────────────────────────────────────────────

/** レコード区分。task=タスク / memo=メモ / event=スケジュール */
export type Kind = "task" | "memo" | "event";

/** 分類の軸（A/B/C の3軸） */
export type Axis = "A" | "B" | "C";

/** 一覧での装飾指定 */
export interface Deco {
  /** 背景色を敷く */
  bg: boolean;
  /** タイトルを太字に */
  bold: boolean;
  /** タイトルをラベル色に */
  accent: boolean;
}

/** 分類マスタの1ラベル */
export interface MasterLabel {
  id: string;
  label: string;
  /** 表示色（HEX） */
  color: string;
  deco: Deco;
  /** 非表示フラグ。true の場合、入力・フィルタの選択肢に出さない（既存項目の表示は継続） */
  hidden?: boolean;
}

/** 1つの分類軸（名称＋ラベル群） */
export interface MasterAxis {
  name: string;
  items: MasterLabel[];
}

/** 分類マスタ全体（A/B/C） */
export type Masters = Record<Axis, MasterAxis>;

/** タスク/メモ/予定を保持する単一レコード */
export interface Item {
  /** 一意ID（本番はUUID推奨） */
  id: number | string;
  kind: Kind;
  title: string;
  /** 分類A/B/Cの各ラベルidを参照 */
  A: string;
  B: string;
  C: string;
  detail1: string;
  detail2: string;
  /** 日時。"YYYY-MM-DDTHH:MM"（時刻あり）or "YYYY-MM-DD"（終日）。Tの有無で終日判定 */
  start: string;
  end: string;
  /** 添付ファイル名（本番はStorage参照に） */
  files: string[];
  /** 完了フラグ（全区分共通） */
  done: boolean;
  /** 旧・連携フラグ（整理対象） */
  synced?: boolean;
  /** 個別通知タイミング（分前）。null=全体設定に従う / -1=なし */
  notify?: number | null;
  /** Zoom 会議ID（連携で自動作成した場合） */
  zoomMeetingId?: string;
  /** Zoom 参加URL */
  zoomJoinUrl?: string;
  /** Zoom パスコード */
  zoomPasscode?: string;
  /** 内部用: 並び替え「データ登録順」の基準（created_at のms）。UIには出さない */
  _seq?: number;
}

/** 通知の全体設定（ユーザー1人1レコード） */
export interface NotifySettings {
  enabled: boolean;
  /** 予定の既定リマインド（分前） */
  defaultLead: number;
  /** タスク期日の既定リマインド（分前） */
  taskLead: number;
  /** 期限超過アラート */
  overdue: boolean;
  /** 静音時間帯 開始 "HH:MM" */
  quietStart: string;
  /** 静音時間帯 終了 "HH:MM" */
  quietEnd: string;
  quietEnabled: boolean;
}

/** カレンダー画面の初期表示設定 */
export interface CalendarDisplayPrefs {
  /** 初期ビュー */
  view: "month" | "week";
  /** 表示する区分 */
  kindFilter: "all" | "task" | "memo" | "event";
  /** 色分けの基準（区分色 / 分類色） */
  colorMode: "kind" | "class";
  /** 完了した項目を隠す */
  hideDone: boolean;
}

/** 一覧画面の初期表示設定 */
export interface ListDisplayPrefs {
  /** 表示する区分 */
  kindFilter: "all" | "task" | "memo" | "event";
  /** 並び順 */
  sort: "default" | "startAsc" | "dueAsc" | "created" | "classA" | "classB" | "classC";
  /** 並び方向 */
  sortDir: "asc" | "desc";
  /** 色分けの基準（区分色 / 分類色） */
  colorMode: "kind" | "class";
  /** 完了した項目も表示する（false=未完了のみ） */
  showDone: boolean;
  /** 過去の予定も表示する（false=非表示） */
  showPast: boolean;
}

/** 初期表示設定（カレンダー画面・一覧画面。ユーザー1人1レコード） */
export interface DisplayPrefs {
  calendar: CalendarDisplayPrefs;
  list: ListDisplayPrefs;
}

/** 連携カレンダーの予定 */
export interface ExtEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  /** Google Meet 等のURL */
  meet?: string;
}

/** 連携カレンダー（Google / iCal 等） */
export interface ExtCalendar {
  id: string;
  name: string;
  /** カレンダー側の色（HEX） */
  color: string;
  /** 登録元（メールアドレス / iCal URL 等） */
  source: string;
  /** 表示ON/OFF */
  enabled: boolean;
  events: ExtEvent[];
}

/** AIチャットが返すアクション（登録/修正/削除/検索/レポート） */
export type AIAction =
  | { type: "register"; items: Partial<Item>[] }
  | { type: "update"; updates: { id: number | string; changes: Partial<Item>; summary?: string }[] }
  | { type: "delete"; ids: (number | string)[]; note?: string }
  | { type: "search"; matchIds: (number | string)[]; note?: string }
  | { type: "report"; title: string; matchIds: (number | string)[]; sections?: string[]; note?: string };

/** AIチャットの応答（返答テキスト＋任意のアクション） */
export interface AIResult {
  reply: string;
  action: AIAction | null;
}
