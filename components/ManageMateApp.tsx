// @ts-nocheck
"use client";
// ─────────────────────────────────────────────────────────────
// ManageMateApp — secretary-app.jsx をフェーズ1でそのまま移植した単一コンポーネント。
// デザイン(ネイビー×ゴールド)・ロジックは一切変更していない。
//
// なぜ @ts-nocheck か:
//   フェーズ1のゴールは「Vercelで動く土台」。3126行を型付けせず載せ替えることを
//   優先し、このファイルだけ型チェックの対象外にしている。新規コード（app/・lib/）は
//   strict な TypeScript で書く。フェーズ2で画面/部品/ヘルパーへ分割する際、
//   lib/types.ts の型を適用しながら @ts-nocheck を外していく。
//
// 本番化で差し替える主な箇所（引き継ぎ書 セクション4 参照）:
//   - AI呼び出しは /api/ai（サーバー）経由で Anthropic を呼ぶ（フェーズ3・実装済み）
//   - React state → Supabase（フェーズ2）
//   - デモ基準日 "2026-06-29" 固定 → 実日付
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef } from "react";
import { useItems } from "@/lib/useItems";
import { useSettings } from "@/lib/useSettings";
import { useGoogleCalendar } from "@/lib/useGoogleCalendar";
import { useZoom } from "@/lib/useZoom";
import {
  Check, Clock, Plus, Send, ListChecks, StickyNote, Calendar as Cal,
  ChevronLeft, ChevronRight, Search, Pin, Tag,
  Database, Paperclip, X, Pencil, Trash2, Bold, Palette, FileText, Upload, Copy,
  Sparkles, Loader, Wand2, ArrowLeft, MessageCircle, CornerDownLeft, Settings, LogOut,
  Home, Star, Bell, Sun, TrendingUp, ChevronRight as ChevR, Sliders, Eye, EyeOff, ChevronUp, ChevronDown, ExternalLink, Video
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// ManageMate — あなたの仕事を支えるAIパートナー
// 入力（タスク/メモ/マスタ切替）・タスク一覧・メモ一覧・マスタ管理・カレンダー
// 分類A/B/C はマスタ管理。ラベルに色とフォント装飾を持たせ、一覧に反映。
// ─────────────────────────────────────────────────────────────

// ライトモード（ネイビー × ゴールド、エグゼクティブ・クリーン）。
// キー名は元の役割を引き継ぐ:
//   ink=背景 / inkSoft=カード面 / inkSofter=境界 / line=淡い境界
//   paper=主要文字 / dim=副次文字 / dimmer=最も淡い文字
//   gold=主アクセント(ネイビー：ボタン/選択/ナビ) / goldSoft=選択時の文字(ネイビー)
//   dawn=警告・期限(朱) / mist=完了・成功(緑) / onAccent=アクセント上の文字
//   accent2=ゴールド(星・強調・プログレス)、navyDeep=サイドバー等の濃紺
const C = {
  ink: "#F4F6FA", inkSoft: "#FFFFFF", inkSofter: "#E4E9F0", line: "#EDF1F6",
  gold: "#1B2A4A", goldSoft: "#1B2A4A", dawn: "#C0492E", mist: "#3C7A5A",
  paper: "#1B2A4A", dim: "#5B6B80", dimmer: "#97A2B3",
  onAccent: "#FFFFFF",
  accent2: "#C9A24B", navyDeep: "#16233E",
};

// 区分による色分け（①）。ソフトパステル(セージ)：タスク=ソフトブルー/メモ=セージグリーン/スケジュール=ソフトゴールド
const KIND_COLOR = { task: "#7C9CD1", memo: "#9FBF9C", event: "#E3C878" };
const KIND_LABEL = { task: "タスク", memo: "メモ", event: "スケジュール" };

// 色ルールに応じて item の表示色を返す
//   mode="class"（②分類ABC、既定）: A→C→Bの順で最初のラベル色
//   mode="kind"（①区分）: 区分ごとの固定色
function itemColor(it, masters, mode) {
  if (mode === "kind") return KIND_COLOR[it.kind] || C.dim;
  for (const ax of ["A", "B", "C"]) {
    const info = lookup(masters, ax, it[ax]);
    if (info) return info.color;
  }
  return it.kind === "task" ? C.dawn : C.mist;
}

// ── 分類マスタ（A/B/Cの使い分けはユーザーに委ねる。意味は固定しない）──
// 各ラベルに表示色と、一覧での装飾(bg: 背景色を敷く / bold: 太字 / accent: タイトル色)を持たせる
const initialMasters = {
  A: {
    name: "分類A",
    items: [
      { id: "a1", label: "ラベルA-1", color: "#C0492E", deco: { bg: true, bold: true, accent: true } },
      { id: "a2", label: "ラベルA-2", color: "#2E5AA8", deco: { bg: false, bold: false, accent: true } },
      { id: "a3", label: "ラベルA-3", color: "#6B7688", deco: { bg: false, bold: false, accent: false } },
    ],
  },
  B: {
    name: "分類B",
    items: [
      { id: "b1", label: "ラベルB-1", color: "#C9A24B", deco: { bg: false, bold: true, accent: false } },
      { id: "b2", label: "ラベルB-2", color: "#6B7688", deco: { bg: false, bold: false, accent: false } },
      { id: "b3", label: "ラベルB-3", color: "#3C7A5A", deco: { bg: false, bold: false, accent: false } },
    ],
  },
  C: {
    name: "分類C",
    items: [
      { id: "c1", label: "ラベルC-1", color: "#C0492E", deco: { bg: true, bold: true, accent: true } },
      { id: "c2", label: "ラベルC-2", color: "#C9A24B", deco: { bg: false, bold: false, accent: false } },
      { id: "c3", label: "ラベルC-3", color: "#6B7688", deco: { bg: false, bold: false, accent: false } },
    ],
  },
};

// ── 連携カレンダー（Google等）のダミーデータ ──
// 本番では設定で登録したiCal URL / Google Calendar API(OAuth) から取得する。
// プレビューでは、登録済みカレンダーとその予定を模したダミーを持つ。
// 各カレンダー: id, name, color(カレンダー側の色), source(登録元), enabled(表示ON/OFF), events(予定)
const initialExtCalendars = [
  {
    id: "gcal-work", name: "業務（Google）", color: "#4285F4", source: "user@gmail.com", enabled: true,
    events: [
      { id: "g1", title: "全体朝会", start: "2026-06-08T09:00", end: "2026-06-08T09:30", meet: "https://meet.google.com/abc-defg-hij" },
      { id: "g2", title: "1on1 (上長)", start: "2026-06-10T16:00", end: "2026-06-10T16:30", meet: "" },
      { id: "g3", title: "部門定例", start: "2026-06-15T11:00", end: "2026-06-15T12:00", meet: "https://meet.google.com/klm-nopq-rst" },
      { id: "g4", title: "四半期レビュー", start: "2026-06-22T14:00", end: "2026-06-22T15:30", meet: "" },
    ],
  },
  {
    id: "gcal-private", name: "プライベート", color: "#0B8043", source: "me.private@gmail.com", enabled: true,
    events: [
      { id: "p1", title: "ジム", start: "2026-06-09T19:00", end: "2026-06-09T20:00", meet: "" },
      { id: "p2", title: "友人と食事", start: "2026-06-13T18:30", end: "2026-06-13T21:00", meet: "" },
      { id: "p3", title: "family day", start: "2026-06-21", end: "2026-06-21", meet: "" },
    ],
  },
  {
    id: "ical-team", name: "チーム共有（iCal）", color: "#F4B400", source: "https://calendar.example.com/team.ics", enabled: false,
    events: [
      { id: "t1", title: "リリース作業", start: "2026-06-18T20:00", end: "2026-06-18T22:00", meet: "" },
      { id: "t2", title: "障害訓練", start: "2026-06-25T10:00", end: "2026-06-25T11:00", meet: "" },
    ],
  },
];

const seedItems = [
  // ── 上旬 ──
  { id: 1, kind: "event", title: "月初の定例会議", A: "a2", B: "b1", C: "c2", detail1: "先月の振り返りと今月の目標共有", detail2: "アジェンダを事前に配布", files: ["議事メモ.txt"], done: true, synced: true, start: "2026-06-01T10:00", end: "2026-06-01T11:00" },
  { id: 2, kind: "task", title: "経費精算（5月分）", A: "a2", B: "b3", C: "c2", detail1: "5月の領収書をまとめて申請", detail2: "", files: ["領収書_5月.pdf"], done: true, synced: true, start: "2026-06-01T14:00", end: "2026-06-01T14:30" },
  { id: 3, kind: "memo", title: "今月の重点テーマ", A: "a1", B: "b2", C: "c1", detail1: "新規提案の質を上げる。既存顧客のフォロー頻度を月2回に。", detail2: "", files: [], done: false, synced: false, start: "", end: "" },
  { id: 4, kind: "task", title: "A社への提案準備", A: "a1", B: "b1", C: "c1", detail1: "ヒアリング内容を整理し、たたき台を作成", detail2: "", files: ["ヒアリングメモ.txt"], done: true, synced: true, start: "2026-06-02T13:00", end: "2026-06-02T16:00" },
  { id: 5, kind: "event", title: "歯科検診", A: "a3", B: "b1", C: "c2", detail1: "定期検診とクリーニング", detail2: "", files: [], done: true, synced: true, start: "2026-06-03T18:00", end: "2026-06-03T18:45" },
  { id: 6, kind: "memo", title: "読みたい本リスト", A: "a3", B: "b2", C: "c3", detail1: "・思考の整理学\n・エフォートレス\n・イシューからはじめよ", detail2: "図書館で予約する", files: [], done: false, synced: false, start: "", end: "" },
  { id: 7, kind: "event", title: "チーム1on1（田中さん）", A: "a2", B: "b1", C: "c2", detail1: "近況とキャリアの相談", detail2: "", files: [], done: true, synced: true, start: "2026-06-04T15:00", end: "2026-06-04T15:30" },
  { id: 8, kind: "task", title: "A社提案書レビュー", A: "a1", B: "b1", C: "c1", detail1: "上長に内容確認を依頼", detail2: "指摘反映は翌日", files: ["提案書_v1.pdf"], done: true, synced: true, start: "2026-06-04T17:00", end: "2026-06-04T18:00" },
  { id: 9, kind: "task", title: "資料の最終仕上げ", A: "a1", B: "b3", C: "c1", detail1: "レビュー指摘を反映して完成", detail2: "", files: ["提案書_final.pdf"], done: true, synced: true, start: "2026-06-05T10:00", end: "2026-06-05T12:00" },
  { id: 10, kind: "memo", title: "打ち合わせの気づき", A: "a1", B: "b2", C: "c2", detail1: "コスト訴求より時間創出の訴求が響く様子。次回に反映。", detail2: "", files: [], done: false, synced: false, start: "", end: "" },

  // ── 中旬 ──
  { id: 11, kind: "event", title: "A社プレゼン本番", A: "a1", B: "b1", C: "c1", detail1: "提案プレゼン。先方は3名参加予定", detail2: "開始15分前に会場入り", files: ["提案書_final.pdf", "デモ手順.txt"], done: false, synced: true, start: "2026-06-08T13:00", end: "2026-06-08T14:30" },
  { id: 12, kind: "task", title: "プレゼン後フォローメール", A: "a1", B: "b1", C: "c2", detail1: "御礼と補足資料を送付", detail2: "", files: [], done: false, synced: true, start: "2026-06-08T16:00", end: "2026-06-08T16:30" },
  { id: 13, kind: "task", title: "週次の経費精算", A: "a2", B: "b2", C: "c2", detail1: "領収書をまとめて申請", detail2: "", files: [], done: false, synced: true, start: "2026-06-09T11:00", end: "2026-06-09T11:30" },
  { id: 14, kind: "memo", title: "経費の領収書置き場", A: "a2", B: "b2", C: "c3", detail1: "クラウドのReceiptsフォルダに集約。月末にまとめて精算。", detail2: "", files: [], done: false, synced: false, start: "", end: "" },
  { id: 15, kind: "event", title: "健康診断", A: "a3", B: "b1", C: "c1", detail1: "年次の健康診断。朝食抜きで受診", detail2: "保険証を忘れずに", files: ["受診案内.pdf"], done: false, synced: true, start: "2026-06-10T09:00", end: "2026-06-10T10:30" },
  { id: 16, kind: "event", title: "B社キックオフ", A: "a1", B: "b1", C: "c1", detail1: "新規案件の初回顔合わせ", detail2: "自己紹介と体制共有", files: [], done: false, synced: true, start: "2026-06-11T10:00", end: "2026-06-11T11:00" },
  { id: 17, kind: "task", title: "B社向け要件整理", A: "a1", B: "b1", C: "c2", detail1: "初回で出た論点をまとめる", detail2: "", files: ["要件メモ.txt"], done: false, synced: true, start: "2026-06-11T14:00", end: "2026-06-11T16:00" },
  { id: 18, kind: "memo", title: "B社の担当者メモ", A: "a1", B: "b2", C: "c3", detail1: "窓口は佐藤さん。決裁は部長。レスは早め。", detail2: "", files: [], done: false, synced: false, start: "", end: "" },
  { id: 19, kind: "task", title: "四半期レポート作成", A: "a2", B: "b1", C: "c1", detail1: "Q1の実績をまとめる", detail2: "数字は経理から取得", files: [], done: false, synced: true, start: "2026-06-12T13:00", end: "2026-06-12T17:00" },
  { id: 20, kind: "event", title: "美容院", A: "a3", B: "b1", C: "c3", detail1: "カットとカラー", detail2: "", files: [], done: false, synced: true, start: "2026-06-13T11:00", end: "2026-06-13T12:30" },

  // ── 下旬 ──
  { id: 21, kind: "memo", title: "旅行の候補地", A: "a3", B: "b2", C: "c3", detail1: "・金沢\n・尾道\n・松本\n連休で1泊2日を検討", detail2: "", files: [], done: false, synced: false, start: "", end: "" },
  { id: 22, kind: "task", title: "レポート提出", A: "a2", B: "b3", C: "c1", detail1: "四半期レポートを部長へ提出", detail2: "", files: ["Q1レポート.pdf"], done: false, synced: true, start: "2026-06-15T10:00", end: "2026-06-15T10:30" },
  { id: 23, kind: "event", title: "B社 要件定義MTG", A: "a1", B: "b1", C: "c1", detail1: "整理した要件を先方と擦り合わせ", detail2: "", files: ["要件メモ.txt"], done: false, synced: true, start: "2026-06-16T14:00", end: "2026-06-16T15:30" },
  { id: 24, kind: "event", title: "社内勉強会（登壇）", A: "a2", B: "b1", C: "c2", detail1: "提案の進め方について15分共有", detail2: "スライド10枚程度", files: ["勉強会スライド.pdf"], done: false, synced: true, start: "2026-06-17T17:00", end: "2026-06-17T17:30" },
  { id: 25, kind: "memo", title: "勉強会で使えそうなネタ", A: "a2", B: "b2", C: "c3", detail1: "時間創出の訴求が刺さった事例を紹介に使う。", detail2: "", files: [], done: false, synced: false, start: "", end: "" },
  { id: 26, kind: "task", title: "父の日ギフト手配", A: "a3", B: "b1", C: "c2", detail1: "オンラインで注文して実家へ配送", detail2: "", files: [], done: false, synced: true, start: "2026-06-18T20:00", end: "2026-06-18T20:20" },
  { id: 27, kind: "task", title: "月次締め準備", A: "a2", B: "b1", C: "c2", detail1: "請求・支払いの一覧を作成", detail2: "", files: [], done: false, synced: true, start: "2026-06-22T13:00", end: "2026-06-22T15:00" },
  { id: 28, kind: "event", title: "C社 定例", A: "a1", B: "b1", C: "c2", detail1: "進捗共有と次アクションの確認", detail2: "", files: [], done: false, synced: true, start: "2026-06-24T10:00", end: "2026-06-24T10:45" },
  { id: 29, kind: "memo", title: "来月やることの下書き", A: "a2", B: "b2", C: "c2", detail1: "B社の設計フェーズ着手。A社の受注可否フォロー。", detail2: "", files: [], done: false, synced: false, start: "", end: "" },
  { id: 30, kind: "task", title: "請求書を送付", A: "a2", B: "b1", C: "c1", detail1: "6月分の請求書をPDFで送付", detail2: "送付後、Slackで一報", files: ["請求書_6月.pdf"], done: false, synced: true, start: "2026-06-29T10:00", end: "2026-06-29T17:00" },
  { id: 31, kind: "task", title: "提案資料の構成案（次案件）", A: "a1", B: "b1", C: "c1", detail1: "論点を3つに整理してドラフトまで", detail2: "", files: ["構成メモ.txt", "参考資料.pdf"], done: false, synced: true, start: "2026-06-29T14:00", end: "2026-06-29T15:00" },
  { id: 32, kind: "task", title: "週次の経費精算", A: "a2", B: "b2", C: "c2", detail1: "領収書をまとめて申請", detail2: "", files: [], done: false, synced: true, start: "2026-06-30T11:00", end: "2026-06-30T11:30" },
  // ── 複数日にまたがる項目 ──
  { id: 33, kind: "event", title: "大阪出張", A: "a1", B: "b1", C: "c1", detail1: "B社訪問と現地調査。2泊3日", detail2: "新幹線・ホテル手配済み", files: ["出張予定.pdf"], done: false, synced: true, start: "2026-06-10T09:00", end: "2026-06-12T18:00" },
  { id: 34, kind: "event", title: "全社カンファレンス", A: "a2", B: "b1", C: "c2", detail1: "年次カンファレンス。終日参加", detail2: "", files: [], done: false, synced: true, start: "2026-06-18T09:00", end: "2026-06-19T17:00" },
  { id: 35, kind: "memo", title: "夏季休暇（予定）", A: "a3", B: "b2", C: "c3", detail1: "旅行で不在。連絡はメールで確認する程度に。", detail2: "", files: [], done: false, synced: false, start: "2026-06-25T00:00", end: "2026-06-27T23:59" },
  // ── 6月10日 のサンプル（10件） ──
  { id: 36, kind: "task", title: "健康診断の受付", A: "a3", B: "b1", C: "c1", detail1: "朝食抜きで受診。保険証を持参。", detail2: "", files: ["受診案内.pdf"], done: false, synced: true, start: "2026-06-10T09:00", end: "2026-06-10T10:30" },
  { id: 37, kind: "event", title: "朝会（チーム）", A: "a2", B: "b1", C: "c2", detail1: "今日のタスク共有", detail2: "", files: [], done: false, synced: true, start: "2026-06-10T11:00", end: "2026-06-10T11:15" },
  { id: 38, kind: "task", title: "提案書の修正対応", A: "a1", B: "b1", C: "c1", detail1: "レビュー指摘を反映", detail2: "午後イチで共有", files: ["提案書_v2.pdf"], done: false, synced: true, start: "2026-06-10T11:30", end: "2026-06-10T12:30" },
  { id: 39, kind: "event", title: "ランチ（同期と）", A: "a3", B: "b1", C: "c3", detail1: "近くのカフェで", detail2: "", files: [], done: false, synced: true, start: "2026-06-10T12:30", end: "2026-06-10T13:30" },
  { id: 40, kind: "event", title: "クライアント定例", A: "a1", B: "b1", C: "c2", detail1: "進捗共有と次アクション確認", detail2: "オンライン", files: [], done: false, synced: true, start: "2026-06-10T14:00", end: "2026-06-10T15:00" },
  { id: 41, kind: "task", title: "議事録の作成・共有", A: "a2", B: "b3", C: "c2", detail1: "定例の議事録をまとめて送付", detail2: "", files: [], done: false, synced: true, start: "2026-06-10T15:00", end: "2026-06-10T15:30" },
  { id: 42, kind: "task", title: "見積書の確認", A: "a1", B: "b2", C: "c1", detail1: "金額と納期をチェックして返信", detail2: "", files: ["見積_ドラフト.pdf"], done: false, synced: true, start: "2026-06-10T16:00", end: "2026-06-10T16:30" },
  { id: 43, kind: "memo", title: "定例で出た宿題", A: "a1", B: "b2", C: "c3", detail1: "・競合比較の資料を追加\n・次回までにKPI案を用意", detail2: "", files: [], done: false, synced: false, start: "2026-06-10", end: "2026-06-10" },
  { id: 44, kind: "task", title: "メール返信（未対応分）", A: "a2", B: "b1", C: "c2", detail1: "午前中に届いた分をまとめて返信", detail2: "", files: [], done: false, synced: true, start: "2026-06-10T17:00", end: "2026-06-10T17:30" },
  { id: 45, kind: "event", title: "ジム", A: "a3", B: "b1", C: "c3", detail1: "退勤後に軽く", detail2: "", files: [], done: false, synced: true, start: "2026-06-10T19:00", end: "2026-06-10T20:00" },
];

// 日時表示のヘルパー（ISO datetime-local → 見やすい和文）
function fmtDT(v) {
  if (!v) return "";
  const [d, t] = v.split("T");
  const [, mo, da] = d.split("-");
  return `${parseInt(mo)}/${parseInt(da)}${t ? " " + t : ""}`;
}
function dueLabel(it) {
  // 一覧の簡易表示：終了(期日)を優先、なければ開始
  if (it.end) return fmtDT(it.end);
  if (it.start) return fmtDT(it.start);
  return "";
}

// ── ヘルパ：マスタからラベル情報を引く ──
function lookup(masters, axis, id) {
  return masters[axis].items.find(x => x.id === id) || null;
}

// 軸の表示名（未設定なら「分類A/B/C」を仮表示）
function axisName(masters, ax) {
  const n = masters[ax] && masters[ax].name;
  return (n && n.trim()) ? n : `分類${ax}`;
}

// 通知タイミング（分前）の選択肢とラベル
const NOTIFY_OPTIONS = [
  { v: -1, label: "なし" },
  { v: 0, label: "時刻ちょうど" },
  { v: 5, label: "5分前" },
  { v: 10, label: "10分前" },
  { v: 30, label: "30分前" },
  { v: 60, label: "1時間前" },
  { v: 1440, label: "1日前" },
];
function notifyLabel(min) {
  const o = NOTIFY_OPTIONS.find(x => x.v === min);
  if (o) return o.label;
  if (min == null || min < 0) return "なし";
  if (min % 1440 === 0) return `${min / 1440}日前`;
  if (min % 60 === 0) return `${min / 60}時間前`;
  return `${min}分前`;
}

// items と通知設定から、通知の一覧を生成（プレビュー用。本番はサーバーがスケジュール送信）
// 種類：予定リマインド / タスク期日リマインド / 期限超過アラート
// NOW（デモの現在時刻）を基準に、発火予定時刻が過去なら「済(発火済み)」、未来なら「予定」とする。
function buildNotifications(items, settings, NOW) {
  if (!settings.enabled) return [];
  const nowMs = new Date(NOW).getTime();
  const list = [];
  const hasTime = (v) => v && v.includes("T");
  items.forEach(it => {
    if (it.done) return; // 完了済みは通知しない
    // 個別指定 notify があればそれを、なければ区分ごとの既定を使う
    if (it.kind === "event" && it.start) {
      const lead = (it.notify != null) ? it.notify : settings.defaultLead;
      if (lead >= 0 && hasTime(it.start)) {
        const fireMs = new Date(it.start).getTime() - lead * 60000;
        list.push({ id: `ev-${it.id}`, itemId: it.id, type: "event", title: it.title,
          when: it.start, fireMs, lead, past: fireMs <= nowMs });
      }
    }
    if (it.kind === "task") {
      const due = it.end || it.start;
      if (due) {
        const lead = (it.notify != null) ? it.notify : settings.taskLead;
        if (lead >= 0) {
          const dueMs = hasTime(due) ? new Date(due).getTime() : new Date(due + "T09:00").getTime();
          const fireMs = dueMs - lead * 60000;
          list.push({ id: `tk-${it.id}`, itemId: it.id, type: "task", title: it.title,
            when: due, fireMs, lead, past: fireMs <= nowMs });
        }
        // 期限超過アラート（期日を過ぎた未完了タスク）
        if (settings.overdue) {
          const dueMs = hasTime(due) ? new Date(due).getTime() : new Date(due + "T23:59").getTime();
          if (dueMs < nowMs) {
            list.push({ id: `od-${it.id}`, itemId: it.id, type: "overdue", title: it.title,
              when: due, fireMs: dueMs, lead: 0, past: true });
          }
        }
      }
    }
  });
  // 新しい発火順（未来が上→近い順、過去は後ろ）
  list.sort((a, b) => {
    if (a.past !== b.past) return a.past ? 1 : -1;
    return a.past ? b.fireMs - a.fireMs : a.fireMs - b.fireMs;
  });
  return list;
}

// ── 共通部品 ──
function LabelChip({ info, small }) {
  if (!info) return null;
  const c = info.color;
  return (
    <span style={{
      fontSize: small ? 10.5 : 11, padding: small ? "2px 8px" : "3px 9px", borderRadius: 999,
      border: `1px solid ${c}55`, color: c, background: `${c}18`, whiteSpace: "nowrap",
      fontWeight: info.deco.bold ? 700 : 400,
    }}>{info.label}</span>
  );
}

// ── ManageMate ロゴ（角丸ネイビースクエア＋白M＋ゴールドのチェック）──
function Logo({ size = 40 }) {
  const navy = C.navyDeep, gold = C.accent2, white = "#FFFFFF";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      {/* 角丸スクエア地 */}
      <rect x="2" y="2" width="44" height="44" rx="12" fill={navy} />
      {/* 白い M */}
      <path d="M12 34V15l8 11 8-11v19" stroke={white} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* ゴールドのチェック（Mの右側に大きく重ねる） */}
      <path d="M24 31l5 5 11-14" stroke={gold} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ScreenHead({ title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", margin: "2px 2px 14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 3, alignSelf: "stretch", minHeight: 26, borderRadius: 2, background: C.accent2, marginTop: 2 }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: C.paper, fontWeight: 700, letterSpacing: 0.3 }}>{title}</h1>
          {sub && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

// ── 一覧の1行（装飾をマスタから反映）──
function ItemRow({ it, masters, onToggle, onOpen, selected, colorMode = "class" }) {
  const a = lookup(masters, "A", it.A);
  const b = lookup(masters, "B", it.B);
  const c = lookup(masters, "C", it.C);
  const kindMode = colorMode === "kind";
  // 背景色・タイトル装飾は「bg/accent が立っているラベル」を優先採用（A→C→Bの順で探す）。区分モードでは装飾を使わず区分色に統一
  const bgSource = kindMode ? null : [a, b, c].find(x => x && x.deco.bg);
  const accentSource = kindMode ? null : [a, b, c].find(x => x && x.deco.accent);
  const boldTitle = kindMode ? false : [a, b, c].some(x => x && x.deco.bold);
  const kindColor = KIND_COLOR[it.kind] || C.dim;

  const KindIcon = it.kind === "task" ? ListChecks : it.kind === "memo" ? StickyNote : Cal;

  return (
    <div onClick={() => onOpen(it.id)} style={{
      display: "flex", gap: 10, padding: "9px 12px", borderRadius: 12, marginBottom: 6, cursor: "pointer", position: "relative", overflow: "hidden",
      // 案5: 文字が乗る面は不透明カード（白）に統一。色味は左の縦バー＋枠線で示す（区分色モード）。
      // 分類色モードの背景装飾(deco.bg)は従来どおり残す。
      background: kindMode ? C.inkSoft : (bgSource ? `${bgSource.color}14` : C.inkSoft),
      border: `1px solid ${selected ? C.gold : (kindMode ? kindColor + "44" : (bgSource ? bgSource.color + "44" : C.inkSofter))}`,
      boxShadow: selected ? `0 0 0 1px ${C.gold}` : "none",
      opacity: it.done ? 0.5 : 1, transition: "border-color .15s, box-shadow .15s",
    }}>
      {/* 区分モード：左端に区分色の縦バー */}
      {kindMode && <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: kindColor }} />}
      {/* 左端：区分アイコン（上）＋完了チェック（下）、上揃え */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, marginTop: 1, marginLeft: kindMode ? 2 : 0 }}>
        <KindIcon size={15} color={kindMode ? kindColor : C.dimmer} />
        <button onClick={(e) => { e.stopPropagation(); onToggle(it.id); }} style={{ ...checkbox(it.done), marginTop: 0 }}>
          {it.done && <Check size={13} color={C.onAccent} strokeWidth={3} />}
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* タイトル ＋ 分類ラベルを横並び */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 14.5, color: accentSource ? accentSource.color : C.paper,
            fontWeight: boldTitle ? 700 : 500,
            textDecoration: it.done ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
          }}>{it.title}</span>
          <LabelChip info={a} small />
          <LabelChip info={b} small />
          <LabelChip info={c} small />
          {it.zoomJoinUrl && <ZoomBadge small />}
        </div>

        {it.detail1 && (
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.dim, lineHeight: 1.4, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>
            {it.detail1.replace(/\n/g, " ")}
          </p>
        )}

        {(dueLabel(it) || it.files.length > 0) && (
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            {dueLabel(it) && <span style={{ fontSize: 11, color: C.dimmer, display: "inline-flex", gap: 3, alignItems: "center" }}>
              <Clock size={10} /> {dueLabel(it)}</span>}
            {it.files.length > 0 && (
              <span style={{ fontSize: 11, color: C.dimmer, display: "inline-flex", gap: 3, alignItems: "center" }}>
                <Paperclip size={10} /> {it.files.length}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 画面：一覧（タスク/メモ/スケジュール統合）──
// ── 円形プログレスリング（SVG）──
function Ring({ size = 64, stroke = 6, pct = 0, color = C.accent2, track = C.inkSofter, children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, pct / 100)));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .5s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}

// ── ホーム用のAI示唆（最優先タスクの選定＋提案文）を /api/ai から取得 ──
// 未完了タスクを渡し、{ priorityId, reason, advice } のJSONを受け取る。失敗時は例外を投げる。
async function fetchHomeInsights(openTasks, masters) {
  const labelOf = (ax, id) => { const it = masters[ax] && masters[ax].items.find(x => x.id === id); return it ? it.label : ""; };
  const today = ymd(new Date());
  const list = openTasks.slice(0, 40).map(t => {
    const cls = ["A", "B", "C"].map(ax => labelOf(ax, t[ax])).filter(Boolean).join("/");
    const due = (t.end || t.start || "").slice(0, 16);
    return `- id:${t.id} | ${t.title}${cls ? " | 分類:" + cls : ""}${due ? " | 期日:" + due : ""}`;
  }).join("\n");
  const prompt = `今日(${today})を踏まえ、未完了タスクから「本日の最優先」を1件選び、短い提案をしてください。
未完了タスク:
${list}
返すJSON: {"priorityId":"<上のidのいずれか>","reason":"選定理由を40字以内で一言","advice":"今日の進め方の提案を60字程度で1〜2文"}`;
  const raw = await completeAI(prompt);
  const parsed = parseAIJson(raw);
  return { priorityId: parsed.priorityId, reason: parsed.reason || "", advice: parsed.advice || "" };
}

// ── 画面：ホーム（ダッシュボード）──
// 【本運用での差し替え方針】
//  このダッシュボードはプレビュー用にダミー値を含む。本番では下記を動的化する：
//   ・最優先タスク／AI提案 … バックエンド経由でAIに items を渡し、優先度判定と提案文を生成
//     （例: POST /api/home-insights → { priorityId, adviceText, ... } を受け取り差し込む）
//   ・進捗リング(70%) … タスクごとの進捗定義（サブタスク完了率・経過時間等）を実データから算出
//   ・今日の予定 … 「実際の今日」でフィルタ（下記 TODAY を実日付に）
//   ・週の棒グラフ … 日別の完了実績を集計した値に置換
//   ・挨拶の時刻 … 端末の現在時刻に置換（下記 hour）
function HomeScreen({ items, masters, onOpen, onGoto, wide }) {
  const tasks = items.filter(i => i.kind === "task");
  const openTasks = tasks.filter(t => !t.done);
  const doneCnt = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((doneCnt / tasks.length) * 100) : 0; // ← 完了率は実データ連動（本物）

  // ── AIによるホームの示唆（最優先タスク＋提案）──
  // ホーム表示時に一度だけ /api/ai へ問い合わせ、未完了タスクから priorityId・reason・advice を得る。
  // 失敗時はルールベースにフォールバックし、その理由を画面に添える。
  const [insights, setInsights] = useState({ status: "idle", priorityId: null, reason: "", advice: "", error: "" });
  const insightsFetched = useRef(false);
  const loadInsights = async () => {
    if (openTasks.length === 0) { setInsights({ status: "empty", priorityId: null, reason: "", advice: "", error: "" }); return; }
    setInsights(s => ({ ...s, status: "loading", error: "" }));
    try {
      const r = await fetchHomeInsights(openTasks, masters);
      const pid = openTasks.some(t => t.id === r.priorityId) ? r.priorityId : null;
      setInsights({ status: "ready", priorityId: pid, reason: r.reason || "", advice: r.advice || "", error: "" });
    } catch (e) {
      setInsights({ status: "error", priorityId: null, reason: "", advice: "", error: (e && e.message) ? e.message : "原因不明のエラー" });
    }
  };
  React.useEffect(() => {
    // items がロードされ未完了タスクが揃ったら一度だけ取得（頻繁な再取得はしない＝コスト配慮）
    if (!insightsFetched.current && openTasks.length > 0) {
      insightsFetched.current = true;
      loadInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTasks.length]);

  // 最優先タスク：AI選定を優先。無効・失敗・未取得時は「装飾Cが最優先→先頭」のルールベース。
  const heuristicPriority = openTasks.find(t => {
    const c = lookup(masters, "C", t.C);
    return c && (c.deco.bold || c.deco.bg);
  }) || openTasks[0];
  const priority = (insights.status === "ready" && insights.priorityId
    ? openTasks.find(t => t.id === insights.priorityId)
    : null) || heuristicPriority;
  const aiSelected = insights.status === "ready" && !!insights.priorityId && priority && priority.id === insights.priorityId;
  const priorityReason = aiSelected ? insights.reason : "";

  // 【本番】"2026-06-29" を実際の今日（new Date()）に置き換え、下の timed を today で絞り込む
  const TODAY = ymd(new Date());
  // 今日の予定：時刻を持つ項目を時刻順に上位4件
  // 【本番】.filter(i => (i.start||"").startsWith(today)) を有効化して当日のみ表示
  const timed = items.filter(i => i.start /* && i.start.startsWith(TODAY) */)
    .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  const fmtTime = (v) => (v && v.includes("T")) ? v.split("T")[1] : "";
  const fmtDate = (v) => { if (!v) return ""; const [, m, d] = v.slice(0, 10).split("-"); return `${parseInt(m)}/${parseInt(d)}`; };

  // 週の棒グラフ（ダミー値）
  // 【本番】日別の「完了タスク数」等を集計して { d, v } に格納（v は 0〜1 に正規化）
  const week = [{ d: "月", v: 0.8 }, { d: "火", v: 1.0 }, { d: "水", v: 0.6 }, { d: "木", v: 0.9 }, { d: "金", v: 0.7 }, { d: "土", v: 0.3 }, { d: "日", v: 0.4 }];

  const hour = new Date().getHours();
  const greet = hour < 11 ? "おはようございます" : hour < 17 ? "こんにちは" : "こんばんは";

  // 提案文：AI応答（advice）を優先。失敗・未取得時はルールベースの定型文にフォールバック。
  const fallbackAdvice = priority
    ? `最優先の「${priority.title}」を午前中に仕上げると、午後の予定に余裕を持って臨めます。`
    : "今日のタスクを整理して、優先度の高いものから着手しましょう。";
  const aiAdvice = (insights.status === "ready" && insights.advice) ? insights.advice : fallbackAdvice;

  return (
    <div style={{ display: wide ? "grid" : "flex", gridTemplateColumns: wide ? "1fr 1fr" : undefined, flexDirection: wide ? undefined : "column", alignItems: wide ? "start" : undefined, gap: 14 }}>
      {/* 挨拶 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, gridColumn: wide ? "1 / -1" : undefined }}>
        <div>
          <div style={{ fontSize: 19, color: C.paper, fontWeight: 700 }}>{greet} <Sun size={17} color={C.accent2} style={{ verticalAlign: -2 }} /></div>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
            今日も素敵な一日になりますように。<b style={{ color: C.dawn }}>{openTasks.length}件</b>のタスクがあります。
          </div>
        </div>
      </div>

      {/* 検索 */}
      <div onClick={() => onGoto("list")} style={{ ...searchBar, cursor: "pointer", gridColumn: wide ? "1 / -1" : undefined }}>
        <Search size={16} color={C.dim} />
        <span style={{ fontSize: 13.5, color: C.dimmer }}>タスク、予定、メモを検索…</span>
      </div>

      {/* 本日の最優先タスク（AI選定・ローディング/失敗フォールバック対応） */}
      {(insights.status === "loading" || priority) && (
        <div style={{ ...cardBox, gridColumn: wide ? "1 / -1" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13.5, color: C.paper, fontWeight: 700 }}>本日の最優先タスク</span>
            {insights.status !== "loading" && (
              <span style={{ fontSize: 10.5, color: aiSelected ? C.mist : C.navyDeep,
                background: (aiSelected ? C.mist : C.accent2) + "22", padding: "2px 8px", borderRadius: 999 }}>
                {aiSelected ? "AIが選定" : "簡易選定"}
              </span>
            )}
          </div>

          {insights.status === "loading" ? (
            <>
              <div style={{ height: 16, width: "60%", borderRadius: 7, background: C.line, marginBottom: 9 }} />
              <div style={{ height: 12, width: "42%", borderRadius: 7, background: C.line, marginBottom: 12 }} />
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.dim }}>
                <Loader size={13} className="spin" /> 今日の状況を分析中…
              </div>
            </>
          ) : (
            <>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Star size={14} color={C.accent2} fill={C.accent2} />
                  <span style={{ fontSize: 10.5, color: C.dim }}>最優先</span>
                </div>
                <div style={{ fontSize: 16, color: C.paper, fontWeight: 700 }}>{priority.title}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  {priority.start && <span style={{ fontSize: 11.5, color: C.dim, display: "inline-flex", gap: 3, alignItems: "center" }}>
                    <Cal size={11} /> {fmtDate(priority.start)} {fmtTime(priority.start)}</span>}
                  {priority.detail1 && <span style={{ fontSize: 11.5, color: C.dimmer, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{priority.detail1}</span>}
                </div>
                {priorityReason && (
                  <div style={{ display: "flex", gap: 5, alignItems: "flex-start", marginTop: 8, fontSize: 11.5, color: C.mist, lineHeight: 1.55 }}>
                    <Sparkles size={12} color={C.mist} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{priorityReason}</span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
                <button onClick={() => onOpen(priority.id)} style={{ ...primaryBtn, marginTop: 0, padding: "10px 16px" }}>タスクを始める</button>
                <button onClick={() => onOpen(priority.id)} style={{ background: "none", border: "none", color: C.dim, fontSize: 13, cursor: "pointer" }}>詳細を見る</button>
              </div>
              {insights.status === "error" && (
                <div style={{ display: "flex", gap: 7, alignItems: "flex-start", background: C.dawn + "0F",
                  border: `1px solid ${C.dawn}33`, borderRadius: 10, padding: "8px 10px", marginTop: 12, fontSize: 11, color: C.dim, lineHeight: 1.55 }}>
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  <span style={{ flex: 1 }}>AIに接続できないため簡易表示です（理由：{insights.error}）。</span>
                  <span onClick={() => loadInsights()} style={{ color: C.dawn, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0 }}>再試行</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 今日の予定 */}
      <div style={cardBox}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13.5, color: C.paper, fontWeight: 700 }}>今日の予定</span>
          <button onClick={() => onGoto("calendar")} style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2 }}>すべて見る <ChevR size={13} /></button>
        </div>
        {timed.length ? timed.map((ev, i) => (
          <div key={ev.id} onClick={() => onOpen(ev.id)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0",
            borderTop: i > 0 ? `1px solid ${C.line}` : "none", cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: C.dim, width: 42, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTime(ev.start)}</span>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: C.accent2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
              {ev.detail1 && <div style={{ fontSize: 11, color: C.dimmer, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.detail1}</div>}
            </div>
            <Cal size={14} color={C.dimmer} />
          </div>
        )) : <div style={{ fontSize: 12.5, color: C.dimmer, padding: "8px 0" }}>時刻付きの予定はありません。</div>}
      </div>

      {/* AIからの提案 */}
      <div style={{ ...cardBox, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: C.accent2 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <Sparkles size={15} color={C.accent2} />
          <span style={{ fontSize: 13.5, color: C.paper, fontWeight: 700 }}>AIからの提案</span>
        </div>
        {insights.status === "loading" ? (
          <div style={{ margin: "2px 0 12px" }}>
            <div style={{ height: 12, width: "92%", borderRadius: 7, background: C.line, marginBottom: 8 }} />
            <div style={{ height: 12, width: "76%", borderRadius: 7, background: C.line, marginBottom: 8 }} />
            <div style={{ height: 12, width: "40%", borderRadius: 7, background: C.line }} />
          </div>
        ) : (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
            {aiAdvice}
          </p>
        )}
        <button onClick={() => onGoto("chat")} style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: `1px solid ${C.inkSofter}`, color: C.paper, fontSize: 12.5, padding: "8px 14px", borderRadius: 9, cursor: "pointer" }}>
          提案を確認する <ChevR size={14} />
        </button>
      </div>

      {/* 進捗サマリー */}
      <div style={cardBox}>
        <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 700, marginBottom: 14 }}>進捗サマリー</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Ring pct={pct} size={78} stroke={7} color={C.navyDeep}>
            <span style={{ fontSize: 17, fontWeight: 700, color: C.paper }}>{pct}%</span>
          </Ring>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>今週のタスク進捗</div>
            <div style={{ fontSize: 12, color: C.dimmer, marginBottom: 10 }}>完了 {doneCnt}件 / 全体 {tasks.length}件</div>
            <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 46 }}>
              {week.map((b, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ width: "100%", height: `${b.v * 34}px`, borderRadius: 3,
                    background: i === 4 ? C.accent2 : C.navyDeep }} />
                  <span style={{ fontSize: 8.5, color: C.dimmer }}>{b.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* クイックアクション */}
      <div>
        <div style={{ fontSize: 12.5, color: C.dim, fontWeight: 600, margin: "0 2px 8px" }}>クイックアクション</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: Plus, t: "タスクを追加", d: "新しいタスク", go: "capture" },
            { icon: Cal, t: "予定を確認", d: "カレンダーを開く", go: "calendar" },
            { icon: StickyNote, t: "メモを作成", d: "クイックメモ", go: "capture" },
            { icon: MessageCircle, t: "AIに相談する", d: "チャットを開く", go: "chat" },
          ].map((q, i) => {
            const Icon = q.icon;
            return (
              <button key={i} onClick={() => onGoto(q.go)} style={{ ...cardBox, textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10, padding: 13 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: C.accent2 + "1F", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon size={16} color={C.accent2} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>{q.t}</div>
                  <div style={{ fontSize: 10.5, color: C.dimmer }}>{q.d}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ListScreen({ items, masters, onToggle, onOpen, selectedId, wide, displayPrefs }) {
  // 初期表示設定（設定 > 初期表示）。未指定は現行の既定値。
  const _dp = (displayPrefs && displayPrefs.list) || {};
  const [kindFilter, setKindFilter] = useState(_dp.kindFilter || "all"); // all | task | memo | event
  const [showDone, setShowDone] = useState(_dp.showDone ?? false);     // 完了も表示するか（全区分共通、既定：未完了のみ）
  const [showPast, setShowPast] = useState(_dp.showPast ?? false);     // 過去の予定も表示するか（スケジュール、既定：非表示）
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false); // 検索バー展開
  const [showSheet, setShowSheet] = useState(false);   // 詳細フィルタ（分類・並び替え）シート
  const [fA, setFA] = useState("");  // 分類Aフィルタ（""=指定なし）
  const [fB, setFB] = useState("");
  const [fC, setFC] = useState("");
  const [sort, setSort] = useState(_dp.sort || "default"); // default | startAsc | dueAsc | created | classA | classB | classC
  const [sortDir, setSortDir] = useState(_dp.sortDir || "asc"); // asc | desc（デフォルト以外で有効）
  const [colorMode, setColorMode] = useState(_dp.colorMode || "kind"); // kind（①区分、既定）| class（②分類）

  const TODAY = ymd(new Date());

  let list = items;
  if (kindFilter !== "all") list = list.filter(i => i.kind === kindFilter);
  // ① 完了フィルタ（全区分共通）：既定は未完了のみ。showDoneで完了も表示。
  if (!showDone) list = list.filter(i => !i.done);
  // ② 過去フィルタ（スケジュールのみ）：終了日(なければ開始日)が現在日より前の予定は既定で非表示。
  //    タスクは期限超過も表示、メモは日付で隠さない（案B）。showPastで解除。
  if (!showPast) {
    list = list.filter(i => {
      if (i.kind !== "event") return true; // タスク・メモは対象外
      const d = (i.end || i.start || "").slice(0, 10);
      if (!d) return true; // 日付なしの予定は残す
      return d >= TODAY;   // 当日以降のみ表示
    });
  }
  // 分類フィルタ
  if (fA) list = list.filter(i => i.A === fA);
  if (fB) list = list.filter(i => i.B === fB);
  if (fC) list = list.filter(i => i.C === fC);
  // 検索
  if (q.trim()) {
    const kw = q.toLowerCase();
    list = list.filter(i => (i.title + i.detail1 + i.detail2).toLowerCase().includes(kw));
  }
  // 分類の並び順インデックス（マスタ内の位置）。未設定は末尾。
  const axisIndex = (axis, id) => {
    const arr = masters[axis].items;
    const i = arr.findIndex(x => x.id === id);
    return i < 0 ? 999 : i;
  };
  // 並び替え（基本は昇順で定義。方向はあとでまとめて反転）
  const baseFns = {
    default: (a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.start || a.end || "9999").localeCompare(b.start || b.end || "9999");
    },
    startAsc: (a, b) => (a.start || "9999").localeCompare(b.start || "9999"),
    dueAsc: (a, b) => (a.end || "9999").localeCompare(b.end || "9999"),
    created: (a, b) => (a._seq || 0) - (b._seq || 0),
    classA: (a, b) => axisIndex("A", a.A) - axisIndex("A", b.A),
    classB: (a, b) => axisIndex("B", a.B) - axisIndex("B", b.B),
    classC: (a, b) => axisIndex("C", a.C) - axisIndex("C", b.C),
  };
  const base = baseFns[sort] || baseFns.default;
  // デフォルト以外は方向（asc/desc）を適用。descは比較結果を反転。
  const cmp = (sort !== "default" && sortDir === "desc") ? (a, b) => -base(a, b) : base;
  list = [...list].sort(cmp);

  const kinds = [
    ["all", "すべて", null],
    ["task", "タスク", ListChecks],
    ["memo", "メモ", StickyNote],
    ["event", "予定", Cal],
  ];
  const activeFilters = (fA ? 1 : 0) + (fB ? 1 : 0) + (fC ? 1 : 0) + (sort !== "default" ? 1 : 0);
  const iconBtnSm = (on) => ({
    width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", cursor: "pointer",
    border: `1px solid ${on ? C.gold + "55" : C.inkSofter}`, background: on ? C.gold + "14" : C.inkSoft, position: "relative",
  });

  // ── 仕切り（グループ分け）──
  // デフォルト→日付グループ / 分類ソート→分類ラベルグループ / それ以外→フラット
  const dateKeyOf = (it) => { const v = it.end || it.start || ""; return v ? v.slice(0, 10) : ""; };
  const classSortAxis = sort === "classA" ? "A" : sort === "classB" ? "B" : sort === "classC" ? "C" : null;
  const groups = [];

  if (sort === "default") {
    const map = new Map();
    list.forEach(it => {
      const dk = dateKeyOf(it);
      let gkey;
      if (!dk) gkey = "none";
      else if (!it.done && dk < TODAY) gkey = "overdue";
      else gkey = "date-" + dk;
      if (!map.has(gkey)) {
        const g = { key: gkey, items: [] };
        if (gkey === "none") { g.type = "none"; g.label = "日付なし"; }
        else if (gkey === "overdue") { g.type = "overdue"; g.label = "期限超過"; }
        else { g.type = "date"; g.date = dk; const [y, m, d] = dk.split("-"); g.label = `${y}年${parseInt(m)}月${parseInt(d)}日`; }
        map.set(gkey, g); groups.push(g);
      }
      map.get(gkey).items.push(it);
    });
    groups.sort((a, b) => {
      const rank = g => g.type === "overdue" ? 0 : g.type === "none" ? 2 : 1;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.type === "none") return 0;
      return a.date.localeCompare(b.date);
    });
  } else if (classSortAxis) {
    // 分類ラベルごとに仕切る（list は既に分類順にソート済みなので順に積む）
    const map = new Map();
    list.forEach(it => {
      const id = it[classSortAxis];
      const info = lookup(masters, classSortAxis, id);
      const gkey = info ? info.id : "none";
      if (!map.has(gkey)) {
        const g = { key: "cls-" + gkey, type: info ? "class" : "none", items: [],
          label: info ? info.label : "未分類", color: info ? info.color : C.dimmer };
        map.set(gkey, g); groups.push(g);
      }
      map.get(gkey).items.push(it);
    });
  } else {
    groups.push({ key: "flat", type: "flat", items: list });
  }

  return (
    <div>
      <ScreenHead title="一覧" sub={`${list.length}件を表示中`} />

      {/* 制御バー：区分セグメント（常時）＋ 検索/フィルタ アイコン */}
      <div style={{ display: "flex", gap: 8, marginBottom: showSearch ? 8 : 12, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", background: C.inkSoft, border: `1px solid ${C.inkSofter}`,
          borderRadius: 10, padding: 2, overflow: "hidden" }}>
          {kinds.map(([k, l, Ico]) => {
            const on = kindFilter === k;
            return (
              <button key={k} onClick={() => setKindFilter(k)} style={{
                flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
                padding: "7px 2px", borderRadius: 8, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", minWidth: 0,
                border: "none", background: on ? C.navyDeep : "transparent", color: on ? "#fff" : C.dim, fontWeight: on ? 600 : 400,
              }}>{Ico && <Ico size={12} color={on ? C.accent2 : C.dim} />} {l}</button>
            );
          })}
        </div>
        <button onClick={() => setShowSearch(s => !s)} style={iconBtnSm(showSearch || q)}>
          <Search size={16} color={showSearch || q ? C.goldSoft : C.dim} />
        </button>
        <button onClick={() => setShowSheet(true)} style={iconBtnSm(activeFilters > 0)}>
          <Sliders size={16} color={activeFilters > 0 ? C.goldSoft : C.dim} />
          {activeFilters > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 15, height: 15,
            borderRadius: 999, background: C.accent2, color: C.navyDeep, fontSize: 9.5, fontWeight: 700,
            display: "grid", placeItems: "center", padding: "0 3px" }}>{activeFilters}</span>}
        </button>
      </div>

      {/* 検索バー（展開時のみ） */}
      {showSearch && (
        <div style={{ ...searchBar, marginBottom: 12 }}>
          <Search size={16} color={C.dim} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="タイトル・詳細を検索" autoFocus
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.paper, fontSize: 14 }} />
          {q && <button onClick={() => setQ("")} style={miniBtn}><X size={13} color={C.dim} /></button>}
        </div>
      )}

      {/* 表示トグル：完了（全区分共通）／過去の予定（スケジュール関連時） */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <button onClick={() => setShowDone(v => !v)} style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999,
          border: `1px solid ${showDone ? C.gold + "55" : C.inkSofter}`, background: showDone ? C.gold + "14" : "transparent",
          color: showDone ? C.goldSoft : C.dim, fontSize: 12, cursor: "pointer" }}>
          <Check size={12} /> {showDone ? "完了も表示中" : "完了を表示"}
        </button>
        {(kindFilter === "all" || kindFilter === "event") && (
          <button onClick={() => setShowPast(v => !v)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999,
            border: `1px solid ${showPast ? C.gold + "55" : C.inkSofter}`, background: showPast ? C.gold + "14" : "transparent",
            color: showPast ? C.goldSoft : C.dim, fontSize: 12, cursor: "pointer" }}>
            <Clock size={12} /> {showPast ? "過去の予定も表示中" : "過去の予定を表示"}
          </button>
        )}
      </div>

      {/* 絞り込み中サマリー（分類・並び替えが効いているとき） */}
      {activeFilters > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
          {[["A", fA, setFA], ["B", fB, setFB], ["C", fC, setFC]].map(([ax, val, setter]) => {
            if (!val) return null;
            const info = lookup(masters, ax, val);
            return (
              <span key={ax} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5,
                padding: "3px 9px", borderRadius: 999, border: `1px solid ${(info?.color || C.dim)}55`,
                color: info?.color || C.dim, background: `${info?.color || C.dim}14` }}>
                {info?.label}
                <X size={11} style={{ cursor: "pointer" }} onClick={() => setter("")} />
              </span>
            );
          })}
          {sort !== "dateAsc" && (
            <span style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 999, border: `1px solid ${C.inkSofter}`, color: C.dim }}>
              {sort === "dateDesc" ? "日時：新しい順" : "登録が新しい順"}
            </span>
          )}
          <button onClick={() => { setFA(""); setFB(""); setFC(""); setSort("dateAsc"); }}
            style={{ fontSize: 11.5, color: C.dawn, background: "none", border: "none", cursor: "pointer" }}>すべて解除</button>
        </div>
      )}

      {groups.map(g => (
        <div key={g.key}>
          {/* 仕切り（セクション見出し）。フラット表示のときは出さない */}
          {g.type !== "flat" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 2px 8px" }}>
            {g.type === "overdue"
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
                  color: C.dawn, background: C.dawn + "14", border: `1px solid ${C.dawn}33`, padding: "3px 10px", borderRadius: 999 }}>
                  <Clock size={12} /> 期限超過</span>
              : g.type === "class"
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700,
                  color: g.color, background: `${g.color}14`, border: `1px solid ${g.color}33`, padding: "3px 10px", borderRadius: 999 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} /> {g.label}</span>
              : <span style={{ fontSize: 12.5, fontWeight: 700, color: g.type === "none" ? C.dimmer : C.paper }}>{g.label}</span>}
            <div style={{ flex: 1, height: 1, background: C.inkSofter }} />
            <span style={{ fontSize: 11, color: C.dimmer }}>{g.items.length}件</span>
          </div>
          )}
          <div style={{ display: wide ? "grid" : "block", gridTemplateColumns: wide ? "1fr 1fr" : undefined, columnGap: wide ? 8 : 0 }}>
          {g.items.map(it => <ItemRow key={it.id} it={it} masters={masters} onToggle={onToggle} onOpen={onOpen} selected={selectedId === it.id} colorMode={colorMode} />)}
          </div>
        </div>
      ))}
      {list.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.dimmer, fontSize: 13.5 }}>該当する項目がありません。</div>}

      {/* 詳細フィルタ・並び替えシート */}
      {showSheet && (
        <FilterSheet {...{ masters, fA, setFA, fB, setFB, fC, setFC, sort, setSort, sortDir, setSortDir, colorMode, setColorMode,
          onClose: () => setShowSheet(false),
          onReset: () => { setFA(""); setFB(""); setFC(""); setSort("default"); setSortDir("asc"); setColorMode("kind"); } }} />
      )}
    </div>
  );
}

// 詳細フィルタ（分類ABC）＋並び替えのボトムシート
function FilterSheet({ masters, fA, setFA, fB, setFB, fC, setFC, sort, setSort, sortDir, setSortDir, colorMode, setColorMode, onClose, onReset, extra }) {
  const pill = (on) => ({ padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${on ? C.gold + "66" : C.inkSofter}`, background: on ? C.gold + "1A" : "transparent",
    color: on ? C.goldSoft : C.dim, fontWeight: on ? 600 : 400 });
  const axisRow = (ax, val, setter) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 7 }}>{axisName(masters, ax)}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button onClick={() => setter("")} style={pill(val === "")}>指定なし</button>
        {masters[ax].items.filter(o => !o.hidden || val === o.id).map(o => {
          const on = val === o.id;
          return (
            <button key={o.id} onClick={() => setter(o.id)} style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? o.color : C.inkSofter}`,
              background: on ? `${o.color}1A` : "transparent", color: on ? o.color : C.dim, fontWeight: on ? 600 : 400,
            }}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(27,42,74,.35)", zIndex: 60 }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: 440, margin: "0 auto", zIndex: 61,
        background: C.inkSoft, borderRadius: "20px 20px 0 0", border: `1px solid ${C.inkSofter}`,
        boxShadow: "0 -12px 40px rgba(27,42,74,.22)", maxHeight: "82vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 10px", borderBottom: `1px solid ${C.inkSofter}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: C.accent2 }} />
            <span style={{ fontSize: 14, color: C.paper, fontWeight: 700 }}>絞り込み{extra ? "" : "・並び替え"}</span>
          </div>
          <button onClick={onClose} style={miniBtn}><X size={15} color={C.dim} /></button>
        </div>
        <div style={{ padding: 18 }}>
          {axisRow("A", fA, setFA)}
          {axisRow("B", fB, setFB)}
          {axisRow("C", fC, setFC)}
          <div style={{ height: 1, background: C.inkSofter, margin: "4px 0 14px" }} />
          {extra ? (
            <>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 7 }}>表示</div>
              <button onClick={() => extra.setHideDone(v => !v)} style={pill(extra.hideDone)}>
                {extra.hideDone ? "完了を非表示中" : "完了を非表示にする"}
              </button>
              {extra.extCalendars && extra.extCalendars.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: C.dim, margin: "14px 0 7px" }}>連携カレンダー</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {extra.extCalendars.map(c => {
                      const on = extra.calVisible[c.id] === undefined ? c.enabled : extra.calVisible[c.id];
                      return (
                        <button key={c.id} onClick={() => extra.setCalVisible(v => ({ ...v, [c.id]: !v[c.id] }))} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                          border: `1px solid ${on ? c.color + "66" : C.inkSofter}`, background: on ? `${c.color}10` : "transparent" }}>
                          <span style={{ width: 18, height: 18, borderRadius: 5, display: "grid", placeItems: "center", flexShrink: 0,
                            border: `1.5px solid ${on ? c.color : C.dimmer}`, background: on ? c.color : "transparent" }}>
                            {on && <Check size={12} color="#fff" strokeWidth={3} />}
                          </span>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13, color: C.paper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 7 }}>並び替え</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[["default", "デフォルト"], ["startAsc", "開始日順"], ["dueAsc", "期日順"], ["created", "データ登録順"],
                  ["classA", `${axisName(masters, "A")}順`], ["classB", `${axisName(masters, "B")}順`], ["classC", `${axisName(masters, "C")}順`]].map(([k, l]) => (
                  <button key={k} onClick={() => setSort(k)} style={pill(sort === k)}>{l}</button>
                ))}
              </div>
              {/* 昇順/降順（デフォルト以外で有効） */}
              {sort !== "default" && setSortDir && (
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button onClick={() => setSortDir("asc")} style={pill(sortDir === "asc")}>昇順 ↑</button>
                  <button onClick={() => setSortDir("desc")} style={pill(sortDir === "desc")}>降順 ↓</button>
                </div>
              )}
            </>
          )}

          {/* 色ルール（①区分 / ②分類ABC） */}
          {setColorMode && (
            <>
              <div style={{ height: 1, background: C.inkSofter, margin: "14px 0" }} />
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 7 }}>色分けのルール</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                <button onClick={() => setColorMode("kind")} style={pill(colorMode === "kind")}>区分の色</button>
                <button onClick={() => setColorMode("class")} style={pill(colorMode === "class")}>分類A/B/Cの色</button>
              </div>
              {colorMode === "kind" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11.5, color: C.dim }}>
                  {[["task", "タスク"], ["memo", "メモ"], ["event", "スケジュール"]].map(([k, l]) => (
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: KIND_COLOR[k] }} /> {l}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, padding: 14, borderTop: `1px solid ${C.inkSofter}` }}>
          <button onClick={onReset} style={ghostBtnFull}>条件をリセット</button>
          <button onClick={onClose} style={{ ...primaryBtn, marginTop: 0, flex: 1, justifyContent: "center" }}>結果を見る</button>
        </div>
      </div>
    </>
  );
}

// エラー本文（Anthropicのエラー等）から人間可読な理由を取り出す。
function aiErrorReason(detail) {
  if (!detail) return "";
  try {
    const j = JSON.parse(detail);
    const msg = (j && j.error && j.error.message) || (j && j.message);
    if (msg) return String(msg);
  } catch {}
  return String(detail).slice(0, 200);
}

// ── AIバックエンド呼び出し（サーバーの /api/ai 経由で Anthropic を呼ぶ）──
// APIキーはサーバー専用の環境変数（ANTHROPIC_API_KEY）でのみ扱う。フロントには出さない。
// 失敗時は「なぜ失敗したか」を含む例外を投げる（呼び出し側でユーザーに理由を提示する）。
async function completeAI(prompt, attachments) {
  let res;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        attachments && attachments.length ? { prompt, attachments } : { prompt }
      ),
    });
  } catch (e) {
    throw new Error("AIサーバーに接続できませんでした（ネットワーク未接続、またはサーバーが起動していません）。");
  }
  if (!res.ok) {
    let info = null;
    try { info = await res.json(); } catch {}
    const reason = aiErrorReason(info && (info.detail || info.error));
    if (res.status === 503) throw new Error("AIのAPIキー（ANTHROPIC_API_KEY）がサーバーに設定されていません。");
    if (res.status === 400) throw new Error("送信内容が不正でした（" + (reason || "リクエスト形式エラー") + "）。");
    if (res.status === 502) throw new Error("AIサービスがエラーを返しました" + (reason ? "：" + reason : "。混雑や一時的な不具合の可能性があります。") + "");
    throw new Error("AIサーバーでエラーが発生しました（HTTP " + res.status + (reason ? "：" + reason : "") + "）。");
  }
  let data = null;
  try { data = await res.json(); } catch {}
  const text = data && typeof data.text === "string" ? data.text : "";
  if (!text) throw new Error("AIから空の応答が返りました。もう一度お試しください。");
  return text;
}

// ── AI振り分け：自然文 → タスク/メモ判定・分類・タイトル・詳細 ──
// ユーザー定義の分類マスタを渡し、その中の id から選ばせる（勝手な分類を作らせない）。
// AIは /api/ai（サーバー）経由で呼ぶ。
async function analyzeWithAI(text, masters) {
  const axisDesc = ["A", "B", "C"].map(ax =>
    `分類${ax}（${masters[ax].name}）の選択肢: ` +
    masters[ax].items.map(it => `{id:"${it.id}", label:"${it.label}"}`).join(", ")
  ).join("\n");

  const prompt = `次の入力文を解析してください。

入力文:
"""${text}"""

判定ルール:
- 行動・締切・やるべきことが含まれるなら kind="task"、記録・覚え書き・参照情報なら kind="memo"。
- title は要点を1行で簡潔に。
- detail1 は本文の主要な内容。detail2 は補足があれば（なければ空文字）。
- 分類A/B/Cは、それぞれ下記の選択肢の id から最も適切なものを1つ選ぶ。判断できなければ各分類の最初の id を使う。

${axisDesc}

返すJSONの形式:
{"kind":"task|memo","title":"...","A":"<id>","B":"<id>","C":"<id>","detail1":"...","detail2":"..."}`;

  const raw = await completeAI(prompt);
  const parsed = parseAIJson(raw);

  // 返ってきた id がマスタに存在するか検証。なければ先頭にフォールバック
  const valid = (ax, id) => masters[ax].items.some(it => it.id === id) ? id : (masters[ax].items[0]?.id || "");
  return {
    kind: parsed.kind === "memo" ? "memo" : "task",
    title: (parsed.title || "").trim() || text.slice(0, 24),
    A: valid("A", parsed.A), B: valid("B", parsed.B), C: valid("C", parsed.C),
    detail1: parsed.detail1 || "", detail2: parsed.detail2 || "",
  };
}

// ── AI基盤が使えないときのローカル簡易応答（キーワードベース） ──
// 本番・AI利用可能時は chatWithAI 本体（AI）で処理される。これは最低限のフォールバック。
function localFallbackChat(userText, masters, items) {
  const t = (userText || "").trim();
  const low = t.toLowerCase();
  const a0 = masters.A.items[0]?.id || "", b0 = masters.B.items[0]?.id || "", c0 = masters.C.items[0]?.id || "";

  // 日付表現をざっくり解釈（基準日 2026-06-29）
  const base = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let dateStr = "";
  if (/今日|きょう/.test(t)) dateStr = toYmd(base);
  else if (/明日|あした|あす/.test(t)) { const d = new Date(base); d.setDate(d.getDate() + 1); dateStr = toYmd(d); }
  else if (/明後日|あさって/.test(t)) { const d = new Date(base); d.setDate(d.getDate() + 2); dateStr = toYmd(d); }
  else { const m = t.match(/(\d{1,2})月(\d{1,2})日/); if (m) dateStr = `2026-${pad(+m[1])}-${pad(+m[2])}`; }
  // 時刻
  let timeStr = "";
  const tm = t.match(/(\d{1,2})時(\d{1,2})?分?/); if (tm) timeStr = `${pad(+tm[1])}:${pad(tm[2] ? +tm[2] : 0)}`;
  const startVal = dateStr ? (timeStr ? `${dateStr}T${timeStr}` : dateStr) : "";

  const wantRegister = /登録|入れて|追加|予定|スケジュール|メモ|タスク/.test(t);
  const wantSearch = /探して|検索|ある\?|あった|どこ|なかった|教えて|一覧/.test(t);
  const wantDelete = /削除|消して|消去|いらない|不要/.test(t);
  const wantReport = /レポート|ＰＤＦ|pdf|PDF|出力|まとめて|帳票/.test(t);

  if (wantReport) {
    return { reply: "レポートを作成します。対象を全データにするか、期間や区分を指定するか教えてください。下のボタンで一旦全件のPDFを作れます。",
      action: { type: "report", title: "ManageMate レポート", matchIds: [], sections: ["タイトル", "日時", "分類", "完了"], note: "全データの一覧" } };
  }
  if (wantDelete) {
    const kw = low.replace(/削除|消して|消去|して|ください|の|を/g, "").trim();
    const hits = items.filter(i => kw && (i.title + i.detail1).toLowerCase().includes(kw)).slice(0, 8).map(i => i.id);
    return { reply: hits.length ? `${hits.length}件が該当しました。削除してよければ確認してください。` : "削除対象が特定できませんでした。タイトルの一部を含めてもう一度指示してください。",
      action: hits.length ? { type: "delete", ids: hits, note: "キーワード一致" } : null };
  }

  if (wantSearch && !wantRegister) {
    const kw = low.replace(/探して|検索|教えて|は\?|ある\?/g, "").trim();
    const hits = items.filter(i => (i.title + i.detail1).toLowerCase().includes(kw)).slice(0, 8).map(i => i.id);
    return { reply: hits.length ? `${hits.length}件見つかりました。` : "該当するデータは見つかりませんでした。",
      action: hits.length ? { type: "search", matchIds: hits, note: "キーワード検索" } : null };
  }

  if (wantRegister || dateStr) {
    // 区分の推定
    const kind = /メモ/.test(t) ? "memo" : (/タスク|やる|対応|準備/.test(t) ? "task" : "event");
    // タイトルは指示語を除いてざっくり生成
    let title = t.replace(/[。、]/g, " ")
      .replace(/(登録して|登録|入れて|追加して|追加|予定|スケジュール|お願い|して|ください|明日|今日|明後日|あした|あす|きょう)/g, " ")
      .replace(/\d{1,2}月\d{1,2}日/g, " ").replace(/\d{1,2}時(\d{1,2}分)?/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!title) title = kind === "event" ? "予定" : kind === "task" ? "タスク" : "メモ";
    return {
      reply: `内容を確認して登録できます。${dateStr ? `（${dateStr}${timeStr ? " " + timeStr : ""}）` : ""}下のカードで内容をご確認ください。`,
      action: { type: "register", items: [{
        kind, title, A: a0, B: b0, C: c0, detail1: "", detail2: "", files: [],
        start: startVal, end: "",
      }] },
    };
  }

  return { reply: "登録は「明日15時に打ち合わせを登録して」、検索は「〜を探して」のように話しかけてください。壁打ちの相談にも乗れます。", action: null };
}

// ── AI応答から JSON を安全に取り出す ──
// コードフェンスや前後の説明文が混ざっても、最初の { 〜 対応する } を抽出してパースする。
function parseAIJson(raw) {
  if (!raw || typeof raw !== "string") throw new Error("empty response");
  let s = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  // 最初の { から、対応する } までを括弧の対応で切り出す
  const start = s.indexOf("{");
  if (start < 0) throw new Error("no json object");
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const jsonStr = end > start ? s.slice(start, end + 1) : s.slice(start);
  return JSON.parse(jsonStr);
}

// ── チャット：会話＋アクション（登録/検索）をAIに判断させる ──
// 返答テキストと、必要に応じた action(JSON) を受け取る。
// AIは completeAI()（サーバーの /api/ai 経由）で呼ぶ。
async function chatWithAI(history, userText, masters, items, hasFiles, attachments) {
  const axisDesc = ["A", "B", "C"].map(ax =>
    `分類${ax}（${masters[ax].name}）: ` + masters[ax].items.map(it => `{id:"${it.id}",label:"${it.label}"}`).join(", ")
  ).join("\n");

  // 検索・更新の手がかりとして既存データの要約を渡す（件数を絞って軽量化）
  const dataDigest = items.slice(0, 20).map(i =>
    `{id:${i.id},kind:"${i.kind}",title:"${i.title}",done:${i.done},start:"${i.start||""}"}`
  ).join("\n");

  // 会話履歴は直近6件だけ渡す（プロンプトを短く保つ）
  const convo = history.slice(-6).map(m => `${m.role === "user" ? "U" : "AI"}: ${m.text}`).join("\n");

  // 【本番差し替え】ファイルの中身解析について
  //  プレビューでは実ファイルを読めないため、AIにファイル名・文脈から「読み取ったつもり」で
  //  提案させるダミー方式。本番ではバックエンドで画像/PDFをAnthropic APIに添付し、
  //  実際の中身（スクショの予定表・資料のテキスト）を解析して register/update を生成する。
  const fileNote = hasFiles
    ? `\n【添付ファイルについて】ユーザーは資料/スクショを添付しています。本番では中身を実際に読み取ります。ここでは添付名と文脈から内容を推測し、登録(register)や修正(update)を積極的に提案してください。`
    : "";

  const prompt = `以下の文脈を踏まえ、ユーザーの新しい発言に応答してください（会話しつつ、必要ならタスク/メモ/予定の登録・修正・検索・レポートを提案）。

【分類マスタ（この中のidから選ぶ）】
${axisDesc}

【既存データ（検索・修正の対象）】
${dataDigest || "（まだデータなし）"}

【これまでの会話】
${convo || "（なし）"}
${fileNote}

【ユーザーの新しい発言】
${userText}

次のJSONだけを返してください（前置き・コードフェンス禁止）:
{
  "reply": "ユーザーへの自然な日本語の返答",
  "action": null または以下のいずれか,
    登録: {"type":"register","items":[{"kind":"task|memo|event","title":"...","A":"<id>","B":"<id>","C":"<id>","detail1":"...","detail2":"","start":"YYYY-MM-DDTHH:MM または空","end":"同左"}]},
    修正: {"type":"update","updates":[{"id":対象データのid数値,"changes":{...変えるフィールドのみ},"summary":"一言"}]},
    削除: {"type":"delete","ids":[対象データのid数値の配列],"note":"何を消すかの一言"},
    検索: {"type":"search","matchIds":[該当データのid数値の配列],"note":"検索の要約"},
    レポート: {"type":"report","title":"レポートの表題","matchIds":[対象データのid配列],"sections":["含める観点の説明"],"note":"どんな内容にするか"}
}

判断の指針:
- 箇条書きや「これ登録して」等は register。各行を1項目に分解。行動・締切ありは task、記録・参照は memo、時間の決まった予定は event。
- 「〜を〇日に変更」「完了にして」等の既存データへの変更は update。changesには変えるフィールドのみ。
- 「〜を削除」「消して」「いらない」等は delete。対象idをidsに入れる。
- 「〜なかった?」「〜を探して」等は search。
- 「レポート」「PDF」「一覧を出力」「まとめを作って」等は report。対象データをmatchIdsに、レポートの狙いをnoteに。まず何を含めるか確認しつつ、指定が明確なら生成する。
- 【繰り返し登録】「毎週」「毎月」「定期的に」「隔週」等、繰り返しの予定/タスクを依頼された場合は、いきなり登録せず、不足している条件を会話で確認する（action は null にして reply で質問）。確認する条件は次のとおり:
  ・頻度（毎日/毎週/毎月/毎年）
  ・間隔（例: 2週ごと＝隔週、3か月ごと 等。既定は1）
  ・毎週なら対象曜日（複数可。例: 月・水・金）
  ・毎月なら方式（毎月同じ日付 か、第N曜日）
  ・終了条件（回数 か、期限日）※終了なしは避け、上限（例: 12か月分/最大52件程度）で区切る
  ・開始日と時刻、タイトル、分類
  条件が出そろったら、その繰り返しに該当する日付を自分で列挙し、register の items に「1回ごとに1件ずつ」複数件を入れて返す（例: 毎週月曜10時×8回 → 8件）。生成しすぎない（多くても52件程度まで）。各itemのtitleは同じで良い。日付はstartに個別の日時、必要ならendも設定。
- 相談・雑談・質問など不要なら action は null。
- 今日は${ymd(new Date())}（日本時間）。日時・曜日はこれを基準に正確に計算する。
- replyは常に必須。何をしたか一言添える。`;

  // サーバーの /api/ai 経由でAIを呼ぶ。失敗時は「なぜ失敗したか」を明示したうえで、
  // ローカルの簡易ルール応答（localFallbackChat）も添えて返す。
  let raw;
  try {
    raw = await completeAI(prompt, attachments);
  } catch (e) {
    const reason = (e && e.message) ? e.message : "原因不明のエラーが発生しました。";
    const fb = localFallbackChat(userText, masters, items);
    return {
      ...fb,
      reply: `AIに接続できなかったため、簡易モードで応答しています。\n理由：${reason}\n\n${fb.reply}`,
    };
  }
  let parsed;
  try {
    parsed = parseAIJson(raw);
  } catch (e) {
    // JSONとして解釈できない場合は、生テキストを返答として扱い、アクションなしにする
    // （AIは応答したが構造化に失敗したケース。空なら理由を添えて返す）
    const fallback = (raw || "").replace(/```json|```/g, "").trim();
    return {
      reply: fallback || "AIの応答を登録・検索アクションとして解釈できませんでした（理由：応答が期待した形式ではありませんでした）。表現を変えてもう一度お試しください。",
      action: null,
    };
  }

  const validAx = (ax, id) => masters[ax].items.some(it => it.id === id) ? id : (masters[ax].items[0]?.id || "");

  // 登録アクションのid検証
  if (parsed.action && parsed.action.type === "register") {
    parsed.action.items = (parsed.action.items || []).map(it => ({
      kind: ["task", "memo", "event"].includes(it.kind) ? it.kind : "task",
      title: (it.title || "").trim() || "無題",
      A: validAx("A", it.A), B: validAx("B", it.B), C: validAx("C", it.C),
      detail1: it.detail1 || "", detail2: it.detail2 || "", files: [],
      start: it.start || "", end: it.end || "",
    }));
  }
  // 修正アクションの検証（存在するidのみ、changesの分類idも検証）
  if (parsed.action && parsed.action.type === "update") {
    parsed.action.updates = (parsed.action.updates || [])
      .filter(u => items.some(i => i.id === u.id))
      .map(u => {
        const ch = { ...u.changes };
        ["A", "B", "C"].forEach(ax => { if (ch[ax] !== undefined) ch[ax] = validAx(ax, ch[ax]); });
        return { id: u.id, changes: ch, summary: u.summary || "変更", before: items.find(i => i.id === u.id) };
      });
  }
  // 削除アクションの検証（存在するidのみ）
  if (parsed.action && parsed.action.type === "delete") {
    parsed.action.ids = (parsed.action.ids || []).filter(id => items.some(i => i.id === id));
    if (parsed.action.ids.length === 0) parsed.action = null;
  }
  // レポートアクションの検証（対象idを実データに限定）
  if (parsed.action && parsed.action.type === "report") {
    parsed.action.matchIds = (parsed.action.matchIds || []).filter(id => items.some(i => i.id === id));
  }
  return { reply: parsed.reply || "（応答を取得できませんでした）", action: parsed.action || null };
}

// ── 画面：AI相談（チャット） ──
function ChatScreen({ masters, items, onAddItems, onUpdateItem, onDeleteItems, onOpenItem }) {
  const [messages, setMessages] = useState([
    { role: "ai", text: "こんにちは、ManageMateです。登録・検索・修正・削除のほか、繰り返しの予定づくり、レポート(PDF)の作成、資料の添付、進め方の相談もできます。何でもどうぞ。" },
  ]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]); // 添付ファイル名
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const fileInput = useRef(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // File → 添付オブジェクト。画像はサムネイル表示用に objectURL を持たせる。
  // 【本番差し替え】プレビューはサムネイル表示のみ。本番ではファイル本体をアップロードし、
  // バックエンド経由で画像/PDFをAnthropic APIに添付して中身を解析する。
  function toAttachment(f, name) {
    const isImage = (f.type || "").startsWith("image/");
    // file 本体を保持し、送信時に縮小＋Base64化して /api/ai に渡す（画像解析用）。
    return { name: name || f.name || "ファイル", url: isImage ? URL.createObjectURL(f) : null, isImage, file: f };
  }
  function addFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setAttachments(prev => [...prev, ...arr.map(f => toAttachment(f))]);
  }
  function pickFiles(e) {
    addFiles(e.target.files);
    e.target.value = "";
  }
  // クリップボードの画像（スクリーンショット等）を貼り付けたら画像添付にする。
  function handlePaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const added = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && (it.type || "").startsWith("image/")) {
        const f = it.getAsFile();
        if (!f) continue;
        const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
        const d = new Date(); const p = (n) => String(n).padStart(2, "0");
        const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
        const name = `スクリーンショット-${stamp}${added.length ? "-" + (added.length + 1) : ""}.${ext}`;
        added.push(toAttachment(f, name));
      }
    }
    if (added.length) {
      e.preventDefault(); // 画像を貼ったときはテキストとして貼り付けさせない
      setAttachments(prev => [...prev, ...added]);
    }
  }

  // 画像Fileを最大辺 maxEdge に縮小し、JPEG の Base64（media_type/data）にして返す。
  // 送信サイズを抑えるため縮小＋JPEG化する（スクショの解析には十分）。
  async function toImagePayload(file, maxEdge = 1568) {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxEdge / Math.max(w, h || 1));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    return { media_type: "image/jpeg", data: out.slice(out.indexOf(",") + 1) };
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    const files = attachments;
    const history = messages.map(m => ({ role: m.role === "user" ? "user" : "ai", text: m.text }));
    // 送信メッセージにファイル情報を含める（本文にも添えてAIに伝える）
    const fileNames = files.map(a => (typeof a === "string" ? a : a.name));
    const textForAI = files.length
      ? `${text}${text ? "\n" : ""}[添付ファイル: ${fileNames.join(", ")}]`
      : text;
    setMessages(m => [...m, { role: "user", text, files }]);
    setInput(""); setAttachments([]); setBusy(true);
    try {
      // 第1段階＝画像のみ。1枚5MB以下・最大4枚を、最大辺1568pxに縮小してBase64化しAIへ渡す。
      const imgFiles = files
        .filter(a => a && typeof a !== "string" && a.isImage && a.file && a.file.size <= 5 * 1024 * 1024)
        .slice(0, 4);
      let imagePayloads = [];
      try { imagePayloads = await Promise.all(imgFiles.map(a => toImagePayload(a.file))); }
      catch { imagePayloads = []; }
      const { reply, action } = await chatWithAI(history, textForAI, masters, items, files.length > 0, imagePayloads);
      setMessages(m => [...m, { role: "ai", text: reply, action }]);
    } catch (e) {
      const reason = (e && e.message) ? e.message : "";
      setMessages(m => [...m, { role: "ai", text: "うまく処理できませんでした。" + (reason ? `\n理由：${reason}` : "もう一度試してください。") }]);
    } finally {
      setBusy(false);
    }
  }

  function approveRegister(msgIdx, regItems) {
    onAddItems(regItems);
    setMessages(m => m.map((mm, i) => i === msgIdx ? { ...mm, action: { ...mm.action, done: true } } : mm));
  }
  function approveUpdate(msgIdx, updates) {
    updates.forEach(u => onUpdateItem(u.id, u.changes));
    setMessages(m => m.map((mm, i) => i === msgIdx ? { ...mm, action: { ...mm.action, done: true } } : mm));
  }
  function approveDelete(msgIdx, ids) {
    onDeleteItems(ids);
    setMessages(m => m.map((mm, i) => i === msgIdx ? { ...mm, action: { ...mm.action, done: true } } : mm));
  }
  // PDFレポート生成：印刷用HTMLを別ウィンドウで開き、ブラウザのPDF保存を使う（日本語も文字化けしない）
  // 【本番】サーバー側でPDF生成（PDFKit等）にして、生成物をダウンロード配布する方式も可
  function generateReport(action) {
    const targets = (action.matchIds && action.matchIds.length)
      ? action.matchIds.map(id => items.find(i => i.id === id)).filter(Boolean)
      : items;
    const esc = (s) => (s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const kindLabel = { task: "タスク", memo: "メモ", event: "予定" };
    const fmt = (v) => { if (!v) return ""; const [d, t] = v.split("T"); const [, m, da] = d.split("-"); return `${parseInt(m)}/${parseInt(da)}${t ? " " + t : ""}`; };
    const rows = targets.map(it => {
      const a = lookup(masters, "A", it.A), b = lookup(masters, "B", it.B), c = lookup(masters, "C", it.C);
      const labels = [a, b, c].filter(Boolean).map(x => esc(x.label)).join(" / ");
      const when = it.start ? fmt(it.start) + (it.end && it.end !== it.start ? " 〜 " + fmt(it.end) : "") : "―";
      return `<tr>
        <td>${it.done ? "✓" : ""}</td>
        <td>${kindLabel[it.kind] || ""}</td>
        <td>${esc(it.title)}</td>
        <td>${when}</td>
        <td>${labels}</td>
      </tr>`;
    }).join("");
    const now = new Date();
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(action.title || "レポート")}</title>
      <style>
        *{font-family:'Hiragino Sans','Yu Gothic',sans-serif;color:#1B2A4A}
        body{margin:32px}
        h1{font-size:20px;border-bottom:3px solid #C9A24B;padding-bottom:8px}
        .meta{font-size:12px;color:#5B6B80;margin:4px 0 18px}
        .note{font-size:12px;color:#5B6B80;margin-bottom:14px;line-height:1.7}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #E4E9F0;padding:7px 9px;text-align:left;vertical-align:top}
        th{background:#1B2A4A;color:#fff;font-weight:600}
        tr:nth-child(even) td{background:#F4F6FA}
        .foot{margin-top:20px;font-size:10.5px;color:#97A2B3}
        @media print{body{margin:12mm}}
      </style></head><body>
      <h1>${esc(action.title || "ManageMate レポート")}</h1>
      <div class="meta">作成日: ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ・ ${targets.length}件</div>
      ${action.note ? `<div class="note">${esc(action.note)}</div>` : ""}
      <table>
        <thead><tr><th style="width:28px">完了</th><th style="width:52px">区分</th><th>タイトル</th><th style="width:130px">日時</th><th style="width:150px">分類</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">対象データがありません</td></tr>`}</tbody>
      </table>
      <div class="foot">Generated by ManageMate</div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),400)}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ScreenHead title="AI相談" sub="登録・検索・壁打ち、何でも" />

      {/* 会話ログ */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 8 }}>
        {messages.map((m, i) => (
          <div key={i}>
            {m.text ? <Bubble role={m.role} text={m.text} /> : null}
            {m.files && m.files.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                {m.files.map((f, fi) => {
                  const label = typeof f === "string" ? f : f.name;
                  const url = typeof f === "string" ? null : f.url;
                  return (
                    <span key={fi} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5,
                      background: C.gold + "14", border: `1px solid ${C.gold}33`, borderRadius: 999,
                      padding: url ? "3px 10px 3px 3px" : "4px 10px", color: C.goldSoft, maxWidth: 200 }}>
                      {url
                        ? <img src={url} alt={label} style={{ width: 20, height: 20, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                        : <FileText size={11} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    </span>
                  );
                })}
              </div>
            )}
            {m.action && m.action.type === "register" && (
              <RegisterCard action={m.action} masters={masters}
                onApprove={() => approveRegister(i, m.action.items)} />
            )}
            {m.action && m.action.type === "update" && (
              <UpdateCard action={m.action} masters={masters}
                onApprove={() => approveUpdate(i, m.action.updates)} />
            )}
            {m.action && m.action.type === "delete" && (
              <DeleteCard action={m.action} items={items}
                onApprove={() => approveDelete(i, m.action.ids)} />
            )}
            {m.action && m.action.type === "report" && (
              <ReportCard action={m.action} items={items}
                onGenerate={() => generateReport(m.action)} />
            )}
            {m.action && m.action.type === "search" && (
              <SearchResult action={m.action} items={items} masters={masters} onOpenItem={onOpenItem} />
            )}
          </div>
        ))}
        {busy && <Bubble role="ai" text="…" typing />}
      </div>

      {/* 添付チップ（あれば入力欄の上に表示） */}
      {attachments.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 10 }}>
          {attachments.map((f, i) => {
            const label = typeof f === "string" ? f : f.name;
            const url = typeof f === "string" ? null : f.url;
            const isImg = typeof f !== "string" && f.isImage;
            return (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
                background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 999,
                padding: url ? "4px 10px 4px 4px" : "5px 10px", color: C.paper, maxWidth: 240 }}>
                {url
                  ? <img src={url} alt={label} style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                  : <FileText size={12} color={C.dim} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                {/* 画像はAIが中身を解析、それ以外は名前のみ渡す旨を表示 */}
                <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, borderRadius: 999, padding: "1px 6px",
                  color: isImg ? C.mist : C.dimmer, background: isImg ? C.mist + "1F" : C.inkSofter }}>
                  {isImg ? "画像を解析" : "名前のみ"}
                </span>
                <X size={12} color={C.dim} style={{ cursor: "pointer", flexShrink: 0 }}
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} />
              </span>
            );
          })}
        </div>
      )}

      {/* 入力 */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 10, borderTop: `1px solid ${C.inkSofter}` }}>
        <button onClick={() => fileInput.current?.click()} title="ファイルを添付" style={{
          width: 42, height: 42, borderRadius: 11, border: `1px solid ${C.inkSofter}`, flexShrink: 0,
          background: C.inkSoft, display: "grid", placeItems: "center", cursor: "pointer" }}>
          <Paperclip size={17} color={C.dim} />
        </button>
        <input ref={fileInput} type="file" multiple onChange={pickFiles} style={{ display: "none" }} />
        <AutoTextarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          onPaste={handlePaste}
          rows={1} maxRows={10} placeholder="メッセージ（⌘/Ctrl+Enterで送信・画像は貼り付けで添付）"
          style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />
        <button onClick={send} disabled={busy || (!input.trim() && attachments.length === 0)} style={{
          width: 44, height: 42, borderRadius: 11, border: "none", flexShrink: 0,
          background: (busy || (!input.trim() && attachments.length === 0)) ? C.inkSofter : C.gold,
          display: "grid", placeItems: "center", cursor: (busy || (!input.trim() && attachments.length === 0)) ? "default" : "pointer" }}>
          {busy ? <Loader size={17} color={C.dim} className="spin" /> : <Send size={17} color={(busy || (!input.trim() && attachments.length === 0)) ? C.dim : C.onAccent} />}
        </button>
      </div>
    </div>
  );
}

function Bubble({ role, text, typing }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "82%", padding: "10px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.65,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        background: isUser ? C.gold : C.inkSoft,
        color: isUser ? C.onAccent : C.paper,
        border: isUser ? "none" : `1px solid ${C.inkSofter}`,
        borderBottomRightRadius: isUser ? 4 : 14, borderBottomLeftRadius: isUser ? 14 : 4,
      }}>
        {typing ? <span style={{ color: C.dim }}>ManageMateが入力中…</span> : text}
      </div>
    </div>
  );
}

function RegisterCard({ action, masters, onApprove }) {
  const done = action.done;
  return (
    <div style={{ marginTop: 8, background: C.inkSoft, border: `1px solid ${done ? C.mist + "55" : C.gold + "44"}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11.5, color: done ? C.mist : C.goldSoft, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        {done ? <><Check size={13} /> 登録しました（{action.items.length}件）</> : <><Plus size={13} /> 登録の確認（{action.items.length}件）</>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {action.items.map((it, i) => {
          const a = lookup(masters, "A", it.A), b = lookup(masters, "B", it.B), c = lookup(masters, "C", it.C);
          return (
            <div key={i} style={{ background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 10, padding: "9px 11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {it.kind === "task" ? <ListChecks size={13} color={C.dim} /> : it.kind === "event" ? <Cal size={13} color={C.dim} /> : <StickyNote size={13} color={C.dim} />}
                <span style={{ fontSize: 13, color: C.paper, fontWeight: 500 }}>{it.title}</span>
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                <LabelChip info={a} small /><LabelChip info={b} small /><LabelChip info={c} small />
              </div>
            </div>
          );
        })}
      </div>
      {!done && (
        <button onClick={onApprove} style={{ ...primaryBtn, marginTop: 10, width: "100%", justifyContent: "center" }}>
          <Check size={15} /> この内容で登録
        </button>
      )}
    </div>
  );
}

// AIによる修正（更新）の確認カード
function UpdateCard({ action, masters, onApprove }) {
  const done = action.done;
  const fieldLabel = { title: "タイトル", start: "開始", end: "終了", detail1: "詳細1", detail2: "詳細2", done: "完了", A: masters.A.name, B: masters.B.name, C: masters.C.name };
  const showVal = (k, v) => {
    if (k === "done") return v ? "完了" : "未完了";
    if (["A", "B", "C"].includes(k)) { const info = lookup(masters, k, v); return info ? info.label : v; }
    return v === "" ? "（空）" : String(v);
  };
  return (
    <div style={{ marginTop: 8, background: C.inkSoft, border: `1px solid ${done ? C.mist + "55" : C.gold + "44"}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11.5, color: done ? C.mist : C.goldSoft, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        {done ? <><Check size={13} /> 修正しました（{action.updates.length}件）</> : <><Pencil size={13} /> 修正の確認（{action.updates.length}件）</>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {action.updates.map((u, i) => (
          <div key={i} style={{ background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 10, padding: "9px 11px" }}>
            <div style={{ fontSize: 13, color: C.paper, fontWeight: 500, marginBottom: 5 }}>
              {u.before ? u.before.title : `ID:${u.id}`}
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>{u.summary}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {Object.entries(u.changes).map(([k, v]) => (
                <div key={k} style={{ fontSize: 11.5, color: C.dim, display: "flex", gap: 6 }}>
                  <span style={{ color: C.dimmer, minWidth: 52 }}>{fieldLabel[k] || k}</span>
                  {u.before && <span style={{ textDecoration: "line-through", color: C.dimmer }}>{showVal(k, u.before[k])}</span>}
                  <span style={{ color: C.dimmer }}>→</span>
                  <span style={{ color: C.paper }}>{showVal(k, v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!done && (
        <button onClick={onApprove} style={{ ...primaryBtn, marginTop: 10, width: "100%", justifyContent: "center" }}>
          <Check size={15} /> この内容で修正
        </button>
      )}
    </div>
  );
}

// AIによる削除の確認カード
function DeleteCard({ action, items, onApprove }) {
  const done = action.done;
  const targets = (action.ids || []).map(id => items.find(i => i.id === id)).filter(Boolean);
  const kindLabel = { task: "タスク", memo: "メモ", event: "予定" };
  return (
    <div style={{ marginTop: 8, background: C.inkSoft, border: `1px solid ${done ? C.mist + "55" : C.dawn + "55"}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11.5, color: done ? C.mist : C.dawn, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        {done ? <><Check size={13} /> 削除しました（{targets.length}件）</> : <><Trash2 size={13} /> 削除の確認（{targets.length}件）</>}
      </div>
      {!done && <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 8 }}>以下を削除します。取り消せません。</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {targets.map(it => (
          <div key={it.id} style={{ background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 10, padding: "8px 11px",
            display: "flex", alignItems: "center", gap: 8, opacity: done ? 0.5 : 1 }}>
            <span style={{ fontSize: 10.5, color: C.dimmer }}>{kindLabel[it.kind]}</span>
            <span style={{ fontSize: 13, color: C.paper, textDecoration: done ? "line-through" : "none" }}>{it.title}</span>
          </div>
        ))}
      </div>
      {!done && (
        <button onClick={onApprove} style={{ marginTop: 10, width: "100%", justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 6,
          padding: "11px 0", borderRadius: 10, border: `1px solid ${C.dawn}`, background: C.dawn, color: "#fff", fontSize: 13.5, cursor: "pointer" }}>
          <Trash2 size={15} /> 削除する
        </button>
      )}
    </div>
  );
}

// AIによるレポート（PDF）生成カード
function ReportCard({ action, items, onGenerate }) {
  const count = (action.matchIds && action.matchIds.length) ? action.matchIds.length : items.length;
  return (
    <div style={{ marginTop: 8, background: C.inkSoft, border: `1px solid ${C.gold}44`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11.5, color: C.goldSoft, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        <FileText size={13} /> レポートの作成
      </div>
      <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 600, marginBottom: 4 }}>{action.title || "レポート"}</div>
      <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>対象: {count}件</div>
      {action.note && <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4, lineHeight: 1.6 }}>{action.note}</div>}
      {action.sections && action.sections.length > 0 && (
        <div style={{ fontSize: 11, color: C.dimmer, marginBottom: 8 }}>含める内容: {action.sections.join(" / ")}</div>
      )}
      <button onClick={onGenerate} style={{ ...primaryBtn, marginTop: 8, width: "100%", justifyContent: "center" }}>
        <FileText size={15} /> PDFを作成（印刷・保存）
      </button>
      <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 8, lineHeight: 1.6 }}>
        ※ 別ウィンドウで開き、ブラウザの印刷から「PDFに保存」を選べます。内容の追加・変更は続けて指示してください。
      </div>
    </div>
  );
}

function SearchResult({ action, items, masters, onOpenItem }) {
  const hits = (action.matchIds || []).map(id => items.find(i => i.id === id)).filter(Boolean);
  return (
    <div style={{ marginTop: 8, background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        <Search size={12} /> {hits.length}件 見つかりました
      </div>
      {hits.length === 0 && <div style={{ fontSize: 12.5, color: C.dimmer }}>該当する項目はありませんでした。</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {hits.map(it => {
          const a = lookup(masters, "A", it.A);
          return (
            <button key={it.id} onClick={() => onOpenItem(it.id)} style={{
              textAlign: "left", background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 10,
              padding: "9px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              {it.kind === "task" ? <ListChecks size={13} color={C.dim} /> : <StickyNote size={13} color={C.dim} />}
              <span style={{ flex: 1, fontSize: 13, color: C.paper, textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.6 : 1 }}>{it.title}</span>
              <LabelChip info={a} small />
              <ChevronRight size={14} color={C.dim} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 画面：入力（おまかせ / 登録フォーム / マスタ 切替）──
// データは単一DB(items)。区分(recKind: task|memo|event)はフォーム内トグルで選ぶ。
function CaptureScreen({ masters, onAddItem, zoom, initialStart, onConsumeInitial, initialDraft, onConsumeInitialDraft }) {
  const [recKind, setRecKind] = useState("task"); // task | memo | event（登録する区分）
  const [makeZoom, setMakeZoom] = useState(false); // 予定登録時にZoom会議を作成するか
  const [zoomBusy, setZoomBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [A, setA] = useState("");   // 分類は既定「指定なし」（任意）
  const [B, setB] = useState("");
  const [Cc, setCc] = useState("");
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [start, setStart] = useState(initialStart || "");
  const [end, setEnd] = useState("");
  const [notify, setNotify] = useState(null); // 個別の通知タイミング（null=既定に従う）
  const [files, setFiles] = useState([]);
  const [flash, setFlash] = useState(null);
  const fileInput = useRef(null);

  // カレンダーから日付指定で来た場合、その日時を開始に入れ、区分を予定・時刻ありにして一度だけ消費
  React.useEffect(() => {
    if (initialStart) {
      setStart(initialStart);
      setRecKind("event");
      onConsumeInitial && onConsumeInitial();
    }
  }, [initialStart]);

  // 複製から来た場合、全項目をフォームに反映して一度だけ消費（完了状態・IDは引き継がない）
  React.useEffect(() => {
    if (initialDraft) {
      setRecKind(initialDraft.kind || "task");
      setTitle(initialDraft.title || "");
      setA(initialDraft.A || "");
      setB(initialDraft.B || "");
      setCc(initialDraft.C || "");
      setD1(initialDraft.detail1 || "");
      setD2(initialDraft.detail2 || "");
      setStart(initialDraft.start || "");
      setEnd(initialDraft.end || "");
      setNotify(initialDraft.notify ?? null);
      setFiles(Array.isArray(initialDraft.files) ? [...initialDraft.files] : []);
      onConsumeInitialDraft && onConsumeInitialDraft();
    }
  }, [initialDraft]);

  function pickFiles(e) {
    const names = Array.from(e.target.files || []).map(f => f.name);
    setFiles(prev => [...prev, ...names]);
    e.target.value = "";
  }
  function renameFile(i) {
    const next = prompt("ファイル名を編集", files[i]);
    if (next != null && next.trim()) setFiles(files.map((f, idx) => idx === i ? next.trim() : f));
  }
  async function submit() {
    if (!title.trim()) { setFlash({ ok: false, msg: "タイトルを入力してください" }); setTimeout(() => setFlash(null), 2000); return; }
    if (start && end && end < start) { setFlash({ ok: false, msg: "終了は開始より後にしてください" }); setTimeout(() => setFlash(null), 2400); return; }
    let zoomFields = {};
    // 予定＋トグルONなら、登録前にZoom会議を作成して紐づける
    if (recKind === "event" && makeZoom && zoom && zoom.connected) {
      setZoomBusy(true);
      try {
        const m = await zoom.createMeeting({ topic: title.trim(), start, end });
        zoomFields = { zoomMeetingId: m.id, zoomJoinUrl: m.join_url, zoomPasscode: m.passcode };
      } catch (e) {
        setZoomBusy(false);
        setFlash({ ok: false, msg: (e && e.message) || "Zoom会議の作成に失敗しました" });
        setTimeout(() => setFlash(null), 3000);
        return;
      }
      setZoomBusy(false);
    }
    onAddItem({ kind: recKind, title: title.trim(), A, B, C: Cc, detail1: d1, detail2: d2, start, end, files, notify, ...zoomFields });
    setFlash({ ok: true, msg: `${recKind === "task" ? "タスク" : recKind === "memo" ? "メモ" : "スケジュール"}として登録しました${zoomFields.zoomJoinUrl ? "（Zoom会議つき）" : ""}` });
    setTitle(""); setD1(""); setD2(""); setStart(""); setEnd(""); setFiles([]); setNotify(null); setMakeZoom(false);
    setTimeout(() => setFlash(null), 2400);
  }

  return (
    <div>
      <ScreenHead title="入力" sub="タスク・メモ・スケジュールを登録" />
      <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* 区分（タスク/メモ/スケジュール）。データは同一DB、区分だけが違い。後から変更も可 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
          {[["task", "タスク", ListChecks], ["memo", "メモ", StickyNote], ["event", "スケジュール", Cal]].map(([k, l, Ico]) => {
            const on = recKind === k;
            return (
              <button key={k} onClick={() => setRecKind(k)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0",
                borderRadius: 10, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
                border: `1px solid ${on ? C.gold + "66" : C.inkSofter}`,
                background: on ? C.gold + "1A" : "transparent", color: on ? C.goldSoft : C.dim,
              }}><Ico size={14} /> {l}</button>
            );
          })}
        </div>

        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル（1行で要点を）"
          style={inputStyle} />

        <div style={{ display: "flex", gap: 8 }}>
          {["A", "B", "C"].map(ax => (
            <span key={ax} style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{axisName(masters, ax)}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Select value={A} onChange={setA} options={masters.A.items} small colorize allowEmpty />
          <Select value={B} onChange={setB} options={masters.B.items} small colorize allowEmpty />
          <Select value={Cc} onChange={setCc} options={masters.C.items} small colorize allowEmpty />
        </div>

        {/* 日時（終日チェック内包・15分刻み） */}
        <DateTimeField start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />

        {/* Zoom会議を作成（予定＋連携時のみ） */}
        {recKind === "event" && zoom && zoom.connected && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            border: `1px solid ${makeZoom ? "#2D8CFF55" : C.inkSofter}`, borderRadius: 10, padding: "10px 12px",
            background: makeZoom ? "#2D8CFF0D" : "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Video size={15} color="#2D8CFF" />
              <span style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>Zoom会議を作成</span>
            </div>
            <button onClick={() => setMakeZoom(v => !v)} style={{ width: 44, height: 25, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, position: "relative", background: makeZoom ? "#2D8CFF" : C.inkSofter }}>
              <span style={{ position: "absolute", top: 2, left: makeZoom ? 21 : 2, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
            </button>
          </div>
        )}

        {/* 通知（タスク・予定のみ。メモは対象外） */}
        {recKind !== "memo" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <Bell size={13} color={C.dim} />
              <span style={{ fontSize: 12, color: C.dim }}>通知（未設定なら全体設定に従う）</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button onClick={() => setNotify(null)} style={pill(notify === null)}>既定</button>
              {NOTIFY_OPTIONS.map(o => (
                <button key={o.v} onClick={() => setNotify(o.v)} style={pill(notify === o.v)}>{o.label}</button>
              ))}
            </div>
          </div>
        )}

        <AutoTextarea value={d1} onChange={e => setD1(e.target.value)} rows={3} placeholder="詳細1"
          style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />
        <AutoTextarea value={d2} onChange={e => setD2(e.target.value)} rows={2} placeholder="詳細2（補足）"
          style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: C.ink,
              border: `1px solid ${C.inkSofter}`, borderRadius: 10, padding: "8px 10px" }}>
              <FileText size={14} color={C.dim} />
              <span style={{ flex: 1, fontSize: 13, color: C.paper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f}</span>
              <button onClick={() => renameFile(i)} style={miniBtn}><Pencil size={12} color={C.dim} /></button>
              <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} style={miniBtn}><X size={12} color={C.dawn} /></button>
            </div>
          ))}
          <button onClick={() => fileInput.current?.click()} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "10px", borderRadius: 10, border: `1px dashed ${C.line}`,
            background: "transparent", color: C.dim, fontSize: 13, cursor: "pointer",
          }}>
            <Upload size={14} /> ファイルを追加
          </button>
          <input ref={fileInput} type="file" multiple onChange={pickFiles} style={{ display: "none" }} />
        </div>

        <button onClick={submit} disabled={zoomBusy} style={{ ...primaryBtn, marginTop: 4, justifyContent: "center", opacity: zoomBusy ? 0.6 : 1 }}>
          {zoomBusy ? "Zoom会議を作成中…" : (recKind === "task" ? "タスクとして登録" : recKind === "memo" ? "メモとして登録" : "スケジュールとして登録")} {zoomBusy ? <Loader size={15} className="spin" /> : <Send size={15} />}
        </button>
      </div>

      {flash && (
        <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12,
          background: (flash.ok ? C.mist : C.dawn) + "1A", border: `1px solid ${(flash.ok ? C.mist : C.dawn)}44`,
          color: flash.ok ? C.mist : C.dawn, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
          {flash.ok ? <Check size={15} /> : <X size={15} />} {flash.msg}
        </div>
      )}
    </div>
  );
}

// ── 画面：設定 ──
function SettingsScreen({ onGotoMaster, onGotoExtCal, onGotoNotify, onGotoInitDisp, extCalendars = [], notifySettings, onSignOut, userEmail }) {
  const activeCal = extCalendars.filter(c => c.enabled).length;
  const rows = [
    { icon: Bell, label: "通知", desc: notifySettings?.enabled ? `オン（予定は既定${notifyLabel(notifySettings.defaultLead)}）` : "オフ", onClick: onGotoNotify },
    { icon: Eye, label: "初期表示", desc: "カレンダー・一覧を開いたときの初期状態を設定", onClick: onGotoInitDisp },
    { icon: Database, label: "分類マスタの管理", desc: "分類A/B/Cのラベル・色・一覧装飾を設定", onClick: onGotoMaster },
    { icon: Cal, label: "連携カレンダー", desc: `Googleカレンダー等の連携・表示設定（${activeCal}件表示中）`, onClick: onGotoExtCal },
  ];
  return (
    <div>
      <ScreenHead title="設定" sub="アプリの設定・管理" />
      <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, overflow: "hidden" }}>
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <button key={i} onClick={r.onClick} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              border: "none", borderBottom: i < rows.length - 1 ? `1px solid ${C.inkSofter}` : "none",
              background: "transparent", cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: C.gold + "1A",
                display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icon size={17} color={C.gold} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, color: C.paper, fontWeight: 500 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{r.desc}</div>
              </div>
              <ChevronRight size={17} color={C.dim} />
            </button>
          );
        })}
      </div>
      {onSignOut && (
        <div style={{ marginTop: 12, background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, overflow: "hidden" }}>
          <button onClick={onSignOut} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
            border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.dawn + "1A",
              display: "grid", placeItems: "center", flexShrink: 0 }}>
              <LogOut size={17} color={C.dawn} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, color: C.dawn, fontWeight: 500 }}>ログアウト</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{userEmail || "アカウントからサインアウト"}</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ── 画面：初期表示（カレンダー画面・一覧画面のデータ表示の初期状態を定義）──
// ここで設定した内容が、各画面を開いたときの初期状態になる。画面内で切り替えた
// 内容はその場限りで、次に開くとここの設定に戻る。保存は明示的な「保存」ボタン。
function InitialDisplaySettingsScreen({ displayPrefs, onSave, onBack }) {
  const baseCal = (displayPrefs && displayPrefs.calendar) || {};
  const baseList = (displayPrefs && displayPrefs.list) || {};
  const [cal, setCal] = useState(() => ({ ...baseCal }));
  const [list, setList] = useState(() => ({ ...baseList }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(cal) !== JSON.stringify(baseCal) || JSON.stringify(list) !== JSON.stringify(baseList);
  const setC = (patch) => { setCal(v => ({ ...v, ...patch })); setSaved(false); };
  const setL = (patch) => { setList(v => ({ ...v, ...patch })); setSaved(false); };

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ calendar: cal, list: list });
      setSaved(true);
    } catch (e) {
      console.error("display prefs save failed", e);
      alert("保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  // セグメント（単一選択）。options: [[value,label], ...]
  const Seg = ({ value, onChange, options }) => (
    <div style={{ display: "flex", background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 10, padding: 2, gap: 2, overflow: "hidden" }}>
      {options.map(([v, l]) => {
        const on = value === v;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            flex: 1, minWidth: 0, border: "none", cursor: "pointer", whiteSpace: "nowrap",
            padding: "8px 4px", borderRadius: 8, fontSize: 11.5,
            background: on ? C.navyDeep : "transparent", color: on ? "#fff" : C.dim, fontWeight: on ? 600 : 400,
          }}>{l}</button>
        );
      })}
    </div>
  );
  // 選択肢が多い項目（並び順）はチップの折り返しで表示
  const Chips = ({ value, onChange, options }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={pill(value === v)}>{l}</button>
      ))}
    </div>
  );
  const Field = ({ label, children, last }) => (
    <div style={{ padding: "12px 14px", borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
  const card = { background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, overflow: "hidden", marginBottom: 14 };
  const cardHead = { display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderBottom: `1px solid ${C.inkSofter}` };
  const cardIcon = { width: 30, height: 30, borderRadius: 9, background: C.gold + "12", display: "grid", placeItems: "center", flexShrink: 0 };

  const KIND_OPTS = [["all", "すべて"], ["task", "タスク"], ["memo", "メモ"], ["event", "予定"]];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 12px" }}>
        <button onClick={onBack} style={{ ...iconBtn, width: 32, height: 32 }}><ArrowLeft size={15} color={C.dim} /></button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: C.paper, fontWeight: 700 }}>初期表示</h1>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>カレンダー・一覧を開いたときの初期状態を設定</div>
        </div>
      </div>

      {/* 説明バナー */}
      <div style={{ background: C.inkSoft, border: `1px solid ${C.accent2}66`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 11, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: C.accent2 + "22", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Eye size={16} color={C.accent2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: C.paper, fontWeight: 600, marginBottom: 3 }}>画面を開いたときの既定を決めます</div>
          <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.65 }}>各画面のフィルタ・並び替えの「最初の状態」を定義します。データそのものは変更しません。</div>
        </div>
      </div>

      {/* カレンダー画面 */}
      <div style={card}>
        <div style={cardHead}>
          <div style={cardIcon}><Cal size={15} color={C.gold} /></div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.paper }}>カレンダー画面</div>
        </div>
        <Field label="初期ビュー">
          <Seg value={cal.view || "month"} onChange={v => setC({ view: v })} options={[["month", "月"], ["week", "週"]]} />
        </Field>
        <Field label="表示する区分">
          <Seg value={cal.kindFilter || "all"} onChange={v => setC({ kindFilter: v })} options={KIND_OPTS} />
        </Field>
        <Field label="色分けの基準">
          <Seg value={cal.colorMode || "kind"} onChange={v => setC({ colorMode: v })} options={[["kind", "区分色"], ["class", "分類色"]]} />
        </Field>
        <Field label="完了した項目" last>
          <Seg value={cal.hideDone ? "hide" : "show"} onChange={v => setC({ hideDone: v === "hide" })} options={[["show", "表示する"], ["hide", "隠す"]]} />
        </Field>
      </div>

      {/* 一覧画面 */}
      <div style={card}>
        <div style={cardHead}>
          <div style={cardIcon}><ListChecks size={15} color={C.gold} /></div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.paper }}>一覧画面</div>
        </div>
        <Field label="表示する区分">
          <Seg value={list.kindFilter || "all"} onChange={v => setL({ kindFilter: v })} options={KIND_OPTS} />
        </Field>
        <Field label="並び順">
          <Chips value={list.sort || "default"} onChange={v => setL({ sort: v })} options={[
            ["default", "既定"], ["startAsc", "開始日"], ["dueAsc", "期日"], ["created", "登録順"],
            ["classA", "分類A"], ["classB", "分類B"], ["classC", "分類C"],
          ]} />
        </Field>
        <Field label="並び方向">
          <Seg value={list.sortDir || "asc"} onChange={v => setL({ sortDir: v })} options={[["asc", "昇順"], ["desc", "降順"]]} />
          <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 6 }}>※「既定」の並び順では方向指定は無効です。</div>
        </Field>
        <Field label="色分けの基準">
          <Seg value={list.colorMode || "kind"} onChange={v => setL({ colorMode: v })} options={[["kind", "区分色"], ["class", "分類色"]]} />
        </Field>
        <Field label="完了した項目">
          <Seg value={list.showDone ? "all" : "undone"} onChange={v => setL({ showDone: v === "all" })} options={[["undone", "未完了のみ"], ["all", "すべて表示"]]} />
        </Field>
        <Field label="過去の予定" last>
          <Seg value={list.showPast ? "show" : "hide"} onChange={v => setL({ showPast: v === "show" })} options={[["hide", "隠す"], ["show", "表示する"]]} />
        </Field>
      </div>

      {/* 保存バー */}
      <button onClick={handleSave} disabled={!dirty || saving} style={{
        width: "100%", padding: "13px", borderRadius: 12, border: "none",
        background: (dirty && !saving) ? C.navyDeep : C.inkSofter, color: (dirty && !saving) ? "#fff" : C.dimmer,
        fontSize: 14, fontWeight: 600, cursor: (dirty && !saving) ? "pointer" : "default",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
      }}>
        {saving
          ? <><Loader size={15} className="spin" /> 保存中…</>
          : saved && !dirty
            ? <><Check size={15} color={C.accent2} /> 保存しました</>
            : <><Check size={15} color={dirty ? C.accent2 : C.dimmer} /> 保存</>}
      </button>
      <div style={{ fontSize: 11, color: C.dimmer, lineHeight: 1.7, padding: "8px 4px 0" }}>
        保存すると、次にカレンダー画面・一覧画面を開いたときからこの設定で表示されます。
      </div>
    </div>
  );
}

// ── 画面：連携カレンダー管理 ──
// ダミー実装。本番では登録URL/メールから iCal取得 or Google Calendar API(OAuth) で連携する。
// 連携カレンダーの表示色プリセット（アプリの区分色＋汎用色）。ほかにHEX直接入力も可。
const CAL_COLOR_PRESETS = ["#C0492E", "#E0602E", "#C9A24B", "#3C7A5A", "#2FA37A", "#2E5AA8", "#6669D8", "#8B4FBE", "#6B7688", "#C64B7E"];

function ExtCalendarScreen({ extCalendars = [], connected, email, loading, onConnect, onDisconnect, onSavePref, zoom, onBack }) {
  const [pickerFor, setPickerFor] = useState(null); // 色ピッカーを開いているカレンダーid
  const [hexDraft, setHexDraft] = useState("");
  const openPicker = (c) => { setPickerFor(pickerFor === c.id ? null : c.id); setHexDraft(c.color || ""); };
  const commitHex = (id) => { if (/^#[0-9a-fA-F]{6}$/.test(hexDraft)) onSavePref(id, { color: hexDraft }); };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 12px" }}>
        <button onClick={onBack} style={{ ...iconBtn, width: 32, height: 32 }}><ArrowLeft size={15} color={C.dim} /></button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: C.paper, fontWeight: 700 }}>連携カレンダー</h1>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>Googleカレンダーの予定表示・Zoom会議の連携</div>
        </div>
      </div>

      {/* Zoom 連携カード（会議の自動作成用） */}
      {zoom && (
        <div style={{ background: C.inkSoft, border: `1px solid ${(zoom.connected ? "#2D8CFF" : C.inkSofter)}${zoom.connected ? "55" : ""}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#2D8CFF", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Video size={18} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 600 }}>{zoom.connected ? "Zoomと連携中" : "Zoom"}</div>
            <div style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {zoom.loading ? "確認中…" : zoom.connected ? (zoom.email || "（アカウント）") : "予定にZoom会議を自動作成・添付"}
            </div>
          </div>
          {zoom.connected ? (
            <button onClick={zoom.disconnect} style={{ ...ghostBtnFull, padding: "8px 12px", color: C.dawn, borderColor: C.dawn + "55" }}>連携を解除</button>
          ) : (
            <button onClick={zoom.connect} disabled={zoom.loading} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#2D8CFF", color: "#fff", border: "none", padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", opacity: zoom.loading ? 0.6 : 1 }}>接続する</button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 30, color: C.dimmer, fontSize: 13, display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <Loader size={16} className="spin" /> 読み込み中…
        </div>
      ) : connected ? (
        <>
          <div style={{ background: C.inkSoft, border: `1px solid ${C.mist}55`, borderRadius: 14, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.mist + "1A", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Check size={18} color={C.mist} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 600 }}>Googleと連携中</div>
              <div style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email || "（アカウント）"}</div>
            </div>
            <button onClick={onDisconnect} style={{ ...ghostBtnFull, padding: "8px 12px", color: C.dawn, borderColor: C.dawn + "55" }}>連携を解除</button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 2px 8px" }}>
            <span style={{ fontSize: 11.5, color: C.dim }}>取得したカレンダー（{extCalendars.length}件）</span>
            <span style={{ fontSize: 11, color: C.dimmer }}>チェック＝初期表示 / 右で色変更</span>
          </div>
          <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
            {extCalendars.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: C.dimmer, fontSize: 13 }}>カレンダーが見つかりませんでした。</div>
            )}
            {extCalendars.map((c, i) => {
              const on = c.enabled !== false;
              const last = i === extCalendars.length - 1;
              const picking = pickerFor === c.id;
              return (
                <div key={c.id} style={{ borderBottom: last && !picking ? "none" : `1px solid ${C.inkSofter}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 15px" }}>
                    {/* デフォルト表示チェック */}
                    <button onClick={() => onSavePref(c.id, { visible: !on })} title="カレンダー画面での初期表示"
                      style={{ ...checkbox(on), border: `1.5px solid ${on ? C.mist : C.dimmer}`, background: on ? C.mist : "transparent", cursor: "pointer", flexShrink: 0 }}>
                      {on && <Check size={13} color={C.onAccent} strokeWidth={3} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: C.paper, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: C.dimmer }}>{c.events.length}件の予定</div>
                    </div>
                    {/* 表示色ピッカー起動 */}
                    <button onClick={() => openPicker(c)} title="表示色を変更"
                      style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${picking ? C.paper : C.inkSofter}`, borderRadius: 9, padding: "5px 8px", background: C.ink, cursor: "pointer", flexShrink: 0 }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: c.color }} />
                      <span style={{ fontSize: 11, color: C.dim }}>色</span>
                    </button>
                  </div>
                  {/* 色ピッカー（展開） */}
                  {picking && (
                    <div style={{ padding: "8px 15px 13px", background: C.ink }}>
                      <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>表示色を選ぶ（プリセット / HEX）</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 9 }}>
                        {CAL_COLOR_PRESETS.map(col => {
                          const sel = (c.color || "").toLowerCase() === col.toLowerCase();
                          return (
                            <button key={col} onClick={() => onSavePref(c.id, { color: col })}
                              style={{ width: 24, height: 24, borderRadius: 6, background: col, border: "none", cursor: "pointer",
                                outline: sel ? `2px solid ${C.paper}` : "none", outlineOffset: 2 }} />
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: C.dim }}>HEX</span>
                        <input value={hexDraft} onChange={e => setHexDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") commitHex(c.id); }} onBlur={() => commitHex(c.id)}
                          placeholder="#2E5AA8" style={{ ...dtStyle, width: 120, fontFamily: "ui-monospace, Menlo, monospace" }} />
                        <button onClick={() => setPickerFor(null)} style={{ ...ghostBtnFull, padding: "7px 12px", fontSize: 12 }}>閉じる</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.7, padding: "0 4px" }}>
            ※ チェックを外したカレンダーはカレンダー画面で初期非表示になります（画面側フィルタで一時的に表示切替も可）。設定は自動保存されます。
          </div>
        </>
      ) : (
        <>
          <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, padding: 22, textAlign: "center", marginBottom: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: C.gold + "12", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
              <Cal size={22} color={C.gold} />
            </div>
            <div style={{ fontSize: 14.5, color: C.paper, fontWeight: 600, marginBottom: 6 }}>Googleカレンダーを連携</div>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: C.dim, lineHeight: 1.7 }}>
              連携すると、あなたのGoogleカレンダーの予定がこのアプリのカレンダーに表示されます。ボタンを押すとGoogleの同意画面が開きます。
            </p>
            <button onClick={onConnect} style={{ ...primaryBtn, marginTop: 0, width: "100%", justifyContent: "center" }}>
              <Cal size={15} /> Googleと連携する
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.7, padding: "0 4px" }}>
            ※ 予定の読み取り（表示）のみ行います。パスワードやAPIキーの入力は不要です。
          </div>
        </>
      )}
    </div>
  );
}

// ── 画面：通知設定 ──
function NotifySettingsScreen({ settings, setSettings, onBack }) {
  const set = (patch) => setSettings(s => ({ ...s, ...patch }));
  const leadOptions = NOTIFY_OPTIONS.filter(o => o.v >= 0);
  const Toggle = ({ on, onClick }) => (
    <button onClick={onClick} style={{ width: 44, height: 25, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, position: "relative",
      background: on ? C.gold : C.inkSofter }}>
      <span style={{ position: "absolute", top: 2, left: on ? 21 : 2, width: 21, height: 21, borderRadius: "50%",
        background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </button>
  );
  const card = { background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 14, padding: 14, marginBottom: 12 };
  const rowBetween = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 12px" }}>
        <button onClick={onBack} style={{ ...iconBtn, width: 32, height: 32 }}><ArrowLeft size={15} color={C.dim} /></button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: C.paper, fontWeight: 700 }}>通知</h1>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>リマインドのタイミングや静音時間を設定</div>
        </div>
      </div>

      {/* 全体ON/OFF */}
      <div style={card}>
        <div style={rowBetween}>
          <div>
            <div style={{ fontSize: 14, color: C.paper, fontWeight: 600 }}>通知を有効にする</div>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>オフにするとすべての通知を停止します</div>
          </div>
          <Toggle on={settings.enabled} onClick={() => set({ enabled: !settings.enabled })} />
        </div>
      </div>

      {settings.enabled && (
        <>
          {/* 予定の既定タイミング */}
          <div style={card}>
            <div style={{ fontSize: 14, color: C.paper, fontWeight: 600, marginBottom: 4 }}>予定のリマインド</div>
            <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 10 }}>各予定の既定。個別に変更も可能です。</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {leadOptions.map(o => (
                <button key={o.v} onClick={() => set({ defaultLead: o.v })} style={pill(settings.defaultLead === o.v)}>{o.label}</button>
              ))}
            </div>
          </div>

          {/* タスク期日の既定タイミング */}
          <div style={card}>
            <div style={{ fontSize: 14, color: C.paper, fontWeight: 600, marginBottom: 4 }}>タスク期日のリマインド</div>
            <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 10 }}>期日を基準にした通知の既定。</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {leadOptions.map(o => (
                <button key={o.v} onClick={() => set({ taskLead: o.v })} style={pill(settings.taskLead === o.v)}>{o.label}</button>
              ))}
            </div>
          </div>

          {/* 期限超過アラート */}
          <div style={card}>
            <div style={rowBetween}>
              <div>
                <div style={{ fontSize: 14, color: C.paper, fontWeight: 600 }}>期限超過アラート</div>
                <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>期日を過ぎた未完了タスクを知らせます</div>
              </div>
              <Toggle on={settings.overdue} onClick={() => set({ overdue: !settings.overdue })} />
            </div>
          </div>

          {/* 静音時間帯 */}
          <div style={card}>
            <div style={{ ...rowBetween, marginBottom: settings.quietEnabled ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 14, color: C.paper, fontWeight: 600 }}>静音時間帯</div>
                <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>この時間帯は通知を鳴らしません</div>
              </div>
              <Toggle on={settings.quietEnabled} onClick={() => set({ quietEnabled: !settings.quietEnabled })} />
            </div>
            {settings.quietEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="time" value={settings.quietStart} onChange={e => set({ quietStart: e.target.value })} style={dtStyle} />
                <span style={{ fontSize: 12.5, color: C.dim }}>〜</span>
                <input type="time" value={settings.quietEnd} onChange={e => set({ quietEnd: e.target.value })} style={dtStyle} />
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.7, padding: "0 4px" }}>
        ※ プレビューでは設定と通知一覧の表示までを実装しています。実際の通知送信（アプリを閉じていても届くプッシュ通知）は、本番環境のプッシュ基盤（FCM/APNs）との接続が必要です。
      </div>
    </div>
  );
}

// ── 通知センター（ベルから開くモーダル） ──
function NotifyCenter({ notifications, settings, onClose, onOpenItem }) {
  const typeMeta = {
    event: { label: "予定", color: "#C9A24B", icon: Cal },
    task: { label: "タスク期日", color: "#2E5AA8", icon: ListChecks },
    overdue: { label: "期限超過", color: C.dawn, icon: Clock },
  };
  const fmt = (v) => { if (!v) return ""; const [d, t] = v.split("T"); const [, m, da] = d.split("-"); return `${parseInt(m)}/${parseInt(da)}${t ? " " + t : ""}`; };
  const upcoming = notifications.filter(n => !n.past);
  const passed = notifications.filter(n => n.past);

  const Row = ({ n }) => {
    const meta = typeMeta[n.type]; const Icon = meta.icon;
    return (
      <button onClick={() => { onOpenItem(n.itemId); onClose(); }} style={{
        width: "100%", textAlign: "left", display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 12px",
        borderRadius: 10, border: `1px solid ${C.inkSofter}`, background: n.past ? C.inkSoft : `${meta.color}0C`, cursor: "pointer", marginBottom: 6 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${meta.color}1F`, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
          <Icon size={15} color={meta.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 10.5, color: meta.color, fontWeight: 700 }}>{meta.label}</span>
            {!n.past && <span style={{ width: 6, height: 6, borderRadius: 99, background: C.dawn }} />}
          </div>
          <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
            {n.type === "overdue" ? `期日 ${fmt(n.when)} を超過` : `${fmt(n.when)}（${notifyLabel(n.lead)}に通知）`}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(27,42,74,.35)", zIndex: 70 }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: 440, margin: "0 auto", zIndex: 71,
        background: C.ink, borderRadius: "20px 20px 0 0", border: `1px solid ${C.inkSofter}`,
        boxShadow: "0 -12px 40px rgba(27,42,74,.22)", maxHeight: "82vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: `1px solid ${C.inkSofter}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={16} color={C.paper} />
            <span style={{ fontSize: 15, color: C.paper, fontWeight: 700 }}>通知</span>
          </div>
          <button onClick={onClose} style={miniBtn}><X size={15} color={C.dim} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {!settings.enabled ? (
            <div style={{ textAlign: "center", padding: 40, color: C.dimmer, fontSize: 13 }}>通知はオフになっています。<br/>設定から有効にできます。</div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.dimmer, fontSize: 13 }}>通知はありません。</div>
          ) : (
            <>
              {passed.length > 0 && <>
                <div style={{ fontSize: 11.5, color: C.dim, fontWeight: 600, margin: "0 2px 8px" }}>最近の通知</div>
                {passed.map(n => <Row key={n.id} n={n} />)}
              </>}
              {upcoming.length > 0 && <>
                <div style={{ fontSize: 11.5, color: C.dim, fontWeight: 600, margin: "14px 2px 8px" }}>これから</div>
                {upcoming.map(n => <Row key={n.id} n={n} />)}
              </>}
            </>
          )}
          <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 14, lineHeight: 1.6, padding: "0 2px" }}>
            ※ プレビューでは予定データから通知を一覧表示しています。実際の配信は本番のプッシュ基盤で行います。
          </div>
        </div>
      </div>
    </>
  );
}

// ── AI振り分けの確認・修正画面 ──
function AIReview({ draft, setDraft, masters, onBack, onConfirm }) {
  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  return (
    <div style={{ background: C.inkSoft, border: `1px solid ${C.gold}44`, borderRadius: 18, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Sparkles size={15} color={C.gold} />
        <span style={{ fontSize: 13.5, color: C.goldSoft, fontWeight: 600 }}>AIの下書き</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: C.dim, lineHeight: 1.6 }}>
        内容を確認して、必要なら直してから登録してください。
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* タスク / メモ 切替 */}
        <div style={{ display: "flex", gap: 6 }}>
          {[["task", "タスク", ListChecks], ["memo", "メモ", StickyNote]].map(([k, l, Ico]) => {
            const on = draft.kind === k;
            return (
              <button key={k} onClick={() => set({ kind: k })} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0",
                borderRadius: 10, fontSize: 13, cursor: "pointer",
                border: `1px solid ${on ? C.gold + "66" : C.inkSofter}`,
                background: on ? C.gold + "1A" : "transparent", color: on ? C.goldSoft : C.dim,
              }}><Ico size={14} /> {l}</button>
            );
          })}
        </div>

        <Field label="タイトル">
          <input value={draft.title} onChange={e => set({ title: e.target.value })} style={inputStyle} />
        </Field>

        <div style={{ display: "flex", gap: 8 }}>
          {["A", "B", "C"].map(ax => (
            <Select key={ax} value={draft[ax]} onChange={v => set({ [ax]: v })} options={masters[ax].items} small colorize allowEmpty />
          ))}
        </div>

        <Field label="詳細1">
          <textarea value={draft.detail1} onChange={e => set({ detail1: e.target.value })} rows={3}
            style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />
        </Field>
        {(draft.detail2 || draft.detail2 === "") && (
          <Field label="詳細2">
            <textarea value={draft.detail2} onChange={e => set({ detail2: e.target.value })} rows={2}
              style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />
          </Field>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <button onClick={onBack} style={{ ...ghostBtnFull, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ArrowLeft size={14} /> 戻る
          </button>
          <button onClick={onConfirm} style={{ ...primaryBtn, marginTop: 0, flex: 1, justifyContent: "center" }}>
            <Check size={15} /> この内容で登録
          </button>
        </div>
      </div>
    </div>
  );
}

function MasterRedirect({ onGotoMaster }) {
  return (
    <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 18, padding: 24, textAlign: "center" }}>
      <Database size={28} color={C.gold} style={{ marginBottom: 12 }} />
      <p style={{ margin: "0 0 16px", fontSize: 14, color: C.dim, lineHeight: 1.7 }}>
        分類A/B/Cのラベル・表示色・一覧での装飾を管理します。
      </p>
      <button onClick={onGotoMaster} style={{ ...primaryBtn, marginTop: 0 }}>マスタ管理を開く <ChevronRight size={15} /></button>
    </div>
  );
}

// ── 画面：マスタ管理 ──
function MasterScreen({ masters, setMasters, onBack }) {
  const [axis, setAxis] = useState("A");
  const m = masters[axis];

  function update(id, patch) {
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis],
      items: prev[axis].items.map(it => it.id === id ? { ...it, ...patch } : it) } }));
  }
  function toggleDeco(id, key) {
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis],
      items: prev[axis].items.map(it => it.id === id ? { ...it, deco: { ...it.deco, [key]: !it.deco[key] } } : it) } }));
  }
  // 非表示フラグの切替
  function toggleHidden(id) {
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis],
      items: prev[axis].items.map(it => it.id === id ? { ...it, hidden: !it.hidden } : it) } }));
  }
  // 並び替え（上下ボタン）：dir = -1（上へ）/ +1（下へ）。端ではスワップしない。
  function move(id, dir) {
    setMasters(prev => {
      const arr = [...prev[axis].items];
      const i = arr.findIndex(it => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...prev, [axis]: { ...prev[axis], items: arr } };
    });
  }
  function addLabel() {
    const id = axis.toLowerCase() + Date.now();
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis],
      items: [...prev[axis].items, { id, label: "新しいラベル", color: "#9AA0AD", deco: { bg: false, bold: false, accent: false }, hidden: false }] } }));
  }
  function remove(id) {
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis], items: prev[axis].items.filter(it => it.id !== id) } }));
  }
  function setName(name) {
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis], name } }));
  }

  const [pickerFor, setPickerFor] = useState(null); // 色選択を開いているラベルid
  // 並び替え上下ボタンのスタイル（端では淡色・無効）
  const rBtn = (dis) => ({ width: 26, height: 17, borderRadius: 6, padding: 0,
    border: `1px solid ${C.inkSofter}`, background: dis ? "transparent" : C.ink,
    display: "grid", placeItems: "center", cursor: dis ? "default" : "pointer", opacity: dis ? 0.4 : 1 });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 8px" }}>
        {onBack && <button onClick={onBack} style={{ ...iconBtn, width: 32, height: 32 }}><ArrowLeft size={15} color={C.dim} /></button>}
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: C.paper, fontWeight: 700 }}>マスタ管理</h1>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>分類のラベル・色・表示順・非表示・一覧装飾を設定</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {["A", "B", "C"].map(k => (
          <button key={k} onClick={() => setAxis(k)} style={chip(axis === k)}>{axisName(masters, k)}</button>
        ))}
      </div>

      <div style={{ background: C.inkSoft, border: `1px solid ${C.accent2}55`, borderRadius: 14, padding: "13px 14px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <span style={{ width: 3, height: 13, borderRadius: 2, background: C.accent2 }} />
          <span style={{ fontSize: 11.5, color: C.dim }}>分類の名前</span>
        </div>
        <input value={m.name} onChange={e => setName(e.target.value)} placeholder={`分類${axis}`}
          style={{ ...inputStyle, fontWeight: 600 }} />
        <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 7 }}>この名前がタブ・入力・フィルタに表示されます（例: 優先度 / カテゴリ）</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {m.items.map((it, idx) => (
          <div key={it.id} style={{ position: "relative", background: it.hidden ? "#FBFBFD" : C.inkSoft,
            border: `1px solid ${C.inkSofter}`, borderRadius: 14, padding: 14 }}>
            {it.hidden && (
              <span style={{ position: "absolute", top: -8, left: 44, fontSize: 10, fontWeight: 700, color: C.dimmer,
                background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 999, padding: "2px 9px" }}>非表示</span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {/* 並び替え（上下） */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                <button onClick={() => move(it.id, -1)} disabled={idx === 0} title="上へ" style={rBtn(idx === 0)}>
                  <ChevronUp size={14} color={idx === 0 ? C.dimmer : C.dim} />
                </button>
                <button onClick={() => move(it.id, 1)} disabled={idx === m.items.length - 1} title="下へ" style={rBtn(idx === m.items.length - 1)}>
                  <ChevronDown size={14} color={idx === m.items.length - 1 ? C.dimmer : C.dim} />
                </button>
              </div>
              <input value={it.label} onChange={e => update(it.id, { label: e.target.value })}
                style={{ ...inputStyle, flex: 1, fontWeight: 600 }} />
              {/* 非表示トグル */}
              <button onClick={() => toggleHidden(it.id)} style={miniBtn}
                title={it.hidden ? "非表示中（タップで表示）" : "表示中（タップで非表示）"}>
                {it.hidden ? <EyeOff size={14} color={C.dimmer} /> : <Eye size={14} color={C.mist} />}
              </button>
              <button onClick={() => remove(it.id)} style={miniBtn}><Trash2 size={14} color={C.dawn} /></button>
            </div>

            {/* 非表示中は下の設定を淡く表示（編集は可能） */}
            <div style={{ opacity: it.hidden ? 0.55 : 1 }}>
              {/* 色選択：現在の色をタップでパレット＋自由ピッカーを開閉 */}
              <div style={{ marginBottom: 12 }}>
                <button onClick={() => setPickerFor(pickerFor === it.id ? null : it.id)} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 10,
                  border: `1px solid ${C.inkSofter}`, background: C.ink, cursor: "pointer", width: "100%",
                }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: it.color, flexShrink: 0,
                    border: `1px solid ${C.line}` }} />
                  <span style={{ fontSize: 13, color: C.paper, flex: 1, textAlign: "left" }}>表示色</span>
                  <span style={{ fontSize: 12, color: C.dimmer, fontVariantNumeric: "tabular-nums" }}>{it.color.toUpperCase()}</span>
                  <ChevronRight size={14} color={C.dim} style={{ transform: pickerFor === it.id ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                </button>
                {pickerFor === it.id && (
                  <ColorPicker value={it.color} onChange={(c) => update(it.id, { color: c })} />
                )}
              </div>

              {/* 装飾トグル */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <DecoToggle on={it.deco.bg} onClick={() => toggleDeco(it.id, "bg")} icon={<Palette size={12} />} label="背景色" />
                <DecoToggle on={it.deco.bold} onClick={() => toggleDeco(it.id, "bold")} icon={<Bold size={12} />} label="太字" />
                <DecoToggle on={it.deco.accent} onClick={() => toggleDeco(it.id, "accent")} icon={<Tag size={12} />} label="タイトル色" />
              </div>

              {/* プレビュー */}
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10,
                background: it.deco.bg ? `${it.color}14` : C.ink,
                border: `1px solid ${it.deco.bg ? it.color + "44" : C.inkSofter}` }}>
                <span style={{ fontSize: 13.5, color: it.deco.accent ? it.color : C.paper, fontWeight: it.deco.bold ? 700 : 400 }}>
                  一覧での見え方プレビュー
                </span>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addLabel} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "12px", borderRadius: 12, border: `1px dashed ${C.line}`,
          background: "transparent", color: C.dim, fontSize: 13.5, cursor: "pointer" }}>
          <Plus size={15} /> ラベルを追加
        </button>
      </div>
    </div>
  );
}

// ── 色選択：体系的パレット（色相×トーン）＋ 自由ピッカー ──
const SWATCHES = [
  // 各行 = 色相、各列 = 明るさ（淡 → 濃）
  ["#F4C9B8", "#E89B7D", "#D6734F", "#B5512F"], // サーモン
  ["#F0DBB0", "#D8B26E", "#BE9442", "#977125"], // ゴールド
  ["#BFE0DB", "#6FA8A0", "#4C857D", "#356159"], // 緑青
  ["#C9CDD6", "#9AA0AD", "#6B7280", "#4A4F5A"], // グレー
  ["#D8C7EC", "#B89BD8", "#9670C2", "#6F4F9B"], // 藤
  ["#BFD4F0", "#7DA8E8", "#5283D0", "#3A62A8"], // 青
  ["#F2C6D8", "#E08AAA", "#C75F86", "#9E4163"], // 桃
];

function ColorPicker({ value, onChange }) {
  const norm = (value || "").toLowerCase();
  return (
    <div style={{ marginTop: 10, padding: 12, background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 12 }}>
      {/* パレット見本 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {SWATCHES.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 6 }}>
            {row.map(c => {
              const sel = norm === c.toLowerCase();
              return (
                <button key={c} onClick={() => onChange(c)} title={c} style={{
                  flex: 1, height: 26, borderRadius: 7, background: c, cursor: "pointer",
                  border: sel ? `2px solid ${C.paper}` : "2px solid transparent",
                  boxShadow: sel ? `0 0 0 1px ${C.ink}` : "none",
                }} />
              );
            })}
          </div>
        ))}
      </div>

      {/* 自由ピッカー＋HEX入力 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10, borderTop: `1px solid ${C.inkSofter}` }}>
        <label style={{ position: "relative", width: 34, height: 34, borderRadius: 9, overflow: "hidden",
          border: `1px solid ${C.line}`, cursor: "pointer", flexShrink: 0, display: "block" }}>
          <span style={{ position: "absolute", inset: 0, background: value }} />
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ position: "absolute", inset: -4, width: "150%", height: "150%", border: "none", padding: 0, cursor: "pointer", opacity: 0 }} />
        </label>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 3 }}>自由に選ぶ / HEX入力</div>
          <input value={value}
            onChange={e => { let v = e.target.value; if (!v.startsWith("#")) v = "#" + v; onChange(v); }}
            spellCheck={false}
            style={{ width: "100%", background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 8,
              padding: "7px 10px", color: C.paper, fontSize: 13, outline: "none", fontVariantNumeric: "tabular-nums",
              boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
      </div>
    </div>
  );
}

function DecoToggle({ on, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 9,
      border: `1px solid ${on ? C.gold + "66" : C.inkSofter}`, cursor: "pointer",
      background: on ? C.gold + "1A" : "transparent", color: on ? C.goldSoft : C.dim, fontSize: 12.5,
    }}>{icon} {label}</button>
  );
}

// ── カレンダー日付ユーティリティ ──
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const addDays = (dt, n) => { const d = new Date(dt); d.setDate(d.getDate() + n); return d; };
const sameYMD = (a, b) => ymd(a) === ymd(b);
const startOfWeek = (dt) => addDays(dt, -dt.getDay()); // 日曜始まり
const startOfMonth = (dt) => new Date(dt.getFullYear(), dt.getMonth(), 1);
const addMonths = (dt, n) => new Date(dt.getFullYear(), dt.getMonth() + n, 1);
// "2026-06-08T14:00" → その日付部分のDate（時刻0時）。無ければnull
const dateOnly = (v) => v ? new Date(v.slice(0, 10) + "T00:00:00") : null;
const dayDiff = (a, b) => Math.round((dateOnly(ymd(b)) - dateOnly(ymd(a))) / 86400000);
// 複数日にまたがる項目か（start/end とも有り、日付が異なる）
function isMultiDay(it) {
  if (!it.start || !it.end) return false;
  return it.start.slice(0, 10) !== it.end.slice(0, 10);
}
// 項目がその日にかかるか（またがり範囲を含む）
function spans(it, dt) {
  const k = ymd(dt);
  if (isMultiDay(it)) {
    return it.start.slice(0, 10) <= k && k <= it.end.slice(0, 10);
  }
  return (it.start && it.start.startsWith(k)) || (it.end && it.end.startsWith(k));
}

// 週表示のラベル（週の範囲。月をまたいでもOK）
function weekLabel(weekStart) {
  const e = addDays(weekStart, 6);
  const f = (dt) => `${dt.getMonth() + 1}/${dt.getDate()}`;
  return `${f(weekStart)} - ${f(e)}`;
}

// ── 画面：カレンダー（月＝タイトル帯 / 週＝時間軸グリッド、Googleカレンダー風） ──
function CalendarScreen({ items, masters, onOpenItem, onNewOnDate, extCalendars = [], displayPrefs }) {
  // 初期表示設定（設定 > 初期表示）。未指定は現行の既定値。
  const _dp = (displayPrefs && displayPrefs.calendar) || {};
  const [view, setView] = useState(_dp.view || "month"); // month | week
  const [sel, setSel] = useState(new Date());        // 選択日(Date)
  const [cursor, setCursor] = useState(startOfMonth(new Date()));   // 表示中の月(Date, 月初)

  // フィルタ（一覧と共通のUI・仕様）
  const [kindFilter, setKindFilter] = useState(_dp.kindFilter || "all"); // all | task | memo | event
  const [showSheet, setShowSheet] = useState(false);
  const [fA, setFA] = useState(""); const [fB, setFB] = useState(""); const [fC, setFC] = useState("");
  const [hideDone, setHideDone] = useState(_dp.hideDone ?? false); // 完了を隠す
  const [colorMode, setColorMode] = useState(_dp.colorMode || "kind"); // kind（①区分、既定）| class（②分類）
  // 連携カレンダーごとの表示ON/OFF（既定は各カレンダーのenabledに従う）
  const [calVisible, setCalVisible] = useState(() => Object.fromEntries(extCalendars.map(c => [c.id, c.enabled])));

  const activeFilters = (fA ? 1 : 0) + (fB ? 1 : 0) + (fC ? 1 : 0) + (hideDone ? 1 : 0) + (colorMode !== "kind" ? 1 : 0);

  // 自アプリの予定（絞り込み後）
  const filteredOwn = items.filter(i => {
    if (kindFilter !== "all" && i.kind !== kindFilter) return false;
    if (fA && i.A !== fA) return false;
    if (fB && i.B !== fB) return false;
    if (fC && i.C !== fC) return false;
    if (hideDone && i.done) return false;
    return true;
  });

  // 連携カレンダーの予定を正規化して統合（表示ONのカレンダーのみ）。区分フィルタは予定=eventのみ通す。
  const extItems = (kindFilter === "all" || kindFilter === "event")
    ? extCalendars.filter(c => calVisible[c.id] === undefined ? c.enabled : calVisible[c.id]).flatMap(c =>
        c.events.map(ev => ({
          id: `${c.id}:${ev.id}`, kind: "event", title: ev.title,
          start: ev.start, end: ev.end, _ext: true, _calColor: c.color, _calName: c.name, _meet: ev.meet || "",
          A: "", B: "", C: "", detail1: "", detail2: "", files: [], done: false,
        }))
      )
    : [];
  // 分類フィルタ中は連携予定（分類なし）は出さない
  const extShown = (fA || fB || fC) ? [] : extItems;
  const filtered = [...filteredOwn, ...extShown];

  // 指定日で新規入力へ（デフォルト9:00）
  const newOn = (dt) => onNewOnDate && onNewOnDate(`${ymd(dt)}T09:00`);

  // item の表示色（連携予定はカレンダー色、それ以外は色ルール）
  const colorOf = (it) => it._ext ? it._calColor : itemColor(it, masters, colorMode);
  // その日(Date)にかかる項目（単日は開始/終了日、複数日は範囲内）
  const onDay = (dt) => filtered.filter(i => spans(i, dt));

  // 予定クリック：連携予定なら簡易モーダル、自前予定なら詳細パネル
  const [extDetail, setExtDetail] = useState(null); // 連携予定の簡易表示
  const handleOpen = (id) => {
    const ext = filtered.find(i => i._ext && i.id === id);
    if (ext) setExtDetail(ext);
    else onOpenItem(id);
  };
  const timeOf = (it, dt) => {
    const k = ymd(dt);
    const src = (it.start && it.start.startsWith(k)) ? it.start
      : (it.end && it.end.startsWith(k) ? it.end : "");
    if (!src || !src.includes("T")) return ""; // 時刻なし（終日）は空文字
    return src.split("T")[1] || "";
  };
  // 終日：開始/終了とも無い、または時刻を持たない（日付のみ "YYYY-MM-DD"）
  const hasTime = (v) => v && v.includes("T");
  const isAllDay = (it) => !hasTime(it.start) && !hasTime(it.end);

  // 選択日を含む週（日曜始まり）の7つのDate
  const weekStart = startOfWeek(sel);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // 月表示のセル（前後の余白は null）
  const monthDates = (() => {
    const first = startOfMonth(cursor);
    const lead = first.getDay();
    const dim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return cells;
  })();

  function navigate(dir) {
    if (view === "week") {
      setSel(prev => {
        const next = addDays(prev, dir * 7);
        setCursor(startOfMonth(next));
        return next;
      });
    } else {
      setCursor(prev => addMonths(prev, dir));
    }
  }

  const monthLabel = `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => navigate(-1)} style={iconBtn}><ChevronLeft size={16} color={C.dim} /></button>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.paper, minWidth: 108, textAlign: "center" }}>
            {view === "week" ? weekLabel(weekStart) : monthLabel}
          </span>
          <button onClick={() => navigate(1)} style={iconBtn}><ChevronRight size={16} color={C.dim} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[["month", "月"], ["week", "週"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={chip(view === k)}>{l}</button>
          ))}
          <button onClick={() => newOn(sel)} title="選択日に予定を追加" style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 11px", borderRadius: 999,
            border: "none", background: C.navyDeep, color: "#fff", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>
            <Plus size={13} color={C.accent2} /> 追加
          </button>
        </div>
      </div>

      {/* 区分セグメント（常時）＋ フィルタアイコン。一覧と共通の操作感 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 16px 8px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", background: C.inkSoft, border: `1px solid ${C.inkSofter}`,
          borderRadius: 10, padding: 2, overflow: "hidden" }}>
          {[["all", "すべて", null], ["task", "タスク", ListChecks], ["memo", "メモ", StickyNote], ["event", "予定", Cal]].map(([k, l, Ico]) => {
            const on = kindFilter === k;
            return (
              <button key={k} onClick={() => setKindFilter(k)} style={{
                flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
                padding: "6px 2px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap", minWidth: 0,
                border: "none", background: on ? C.navyDeep : "transparent", color: on ? "#fff" : C.dim, fontWeight: on ? 600 : 400,
              }}>{Ico && <Ico size={11} color={on ? C.accent2 : C.dim} />} {l}</button>
            );
          })}
        </div>
        <button onClick={() => setShowSheet(true)} style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", cursor: "pointer",
          border: `1px solid ${activeFilters > 0 ? C.gold + "55" : C.inkSofter}`, background: activeFilters > 0 ? C.gold + "14" : C.inkSoft, position: "relative" }}>
          <Sliders size={15} color={activeFilters > 0 ? C.goldSoft : C.dim} />
          {activeFilters > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 15, height: 15,
            borderRadius: 999, background: C.accent2, color: C.navyDeep, fontSize: 9.5, fontWeight: 700,
            display: "grid", placeItems: "center", padding: "0 3px" }}>{activeFilters}</span>}
        </button>
      </div>

      {view === "month"
        ? <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px 10px" }}>
            <MonthGrid {...{ monthDates, cursor, onDay, colorOf, timeOf, sel, setSel, onOpenItem: handleOpen, newOn }} />
          </div>
        : <WeekTimeline {...{ weekDates, onDay, colorOf, timeOf, isAllDay, sel, setSel, onOpenItem: handleOpen, newOn, allItems: filtered }} />}

      {showSheet && (
        <FilterSheet {...{ masters, fA, setFA, fB, setFB, fC, setFC, sort: "", setSort: () => {}, colorMode, setColorMode,
          onClose: () => setShowSheet(false), onReset: () => { setFA(""); setFB(""); setFC(""); setHideDone(false); setColorMode("kind"); },
          extra: { hideDone, setHideDone, extCalendars, calVisible, setCalVisible } }} />
      )}

      {extDetail && <ExtEventModal ev={extDetail} onClose={() => setExtDetail(null)} />}
    </div>
  );
}

// 連携予定の簡易表示（Meet URL発行のダミー含む）
function ExtEventModal({ ev, onClose }) {
  const [meet, setMeet] = useState(ev._meet || "");
  const [issuing, setIssuing] = useState(false);
  const fmt = (v) => {
    if (!v) return "";
    const [d, t] = v.split("T");
    const [, m, da] = d.split("-");
    return `${parseInt(m)}/${parseInt(da)}${t ? " " + t : "（終日）"}`;
  };
  function issueMeet() {
    setIssuing(true);
    // ダミー：本番では Google Calendar API の conferenceData で発行
    setTimeout(() => {
      const rnd = Math.random().toString(36).slice(2, 6);
      setMeet(`https://meet.google.com/${rnd}-demo-link`);
      setIssuing(false);
    }, 700);
  }
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(27,42,74,.35)", zIndex: 60 }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: 440, margin: "0 auto", zIndex: 61,
        background: C.inkSoft, borderRadius: "20px 20px 0 0", border: `1px solid ${C.inkSofter}`,
        boxShadow: "0 -12px 40px rgba(27,42,74,.22)", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.dim }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: ev._calColor }} /> {ev._calName}・連携カレンダー
          </span>
          <button onClick={onClose} style={miniBtn}><X size={15} color={C.dim} /></button>
        </div>
        <div style={{ fontSize: 17, color: C.paper, fontWeight: 700, marginBottom: 6 }}>{ev.title}</div>
        <div style={{ fontSize: 13, color: C.dim, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <Clock size={13} /> {fmt(ev.start)}{ev.end && ev.end !== ev.start ? ` 〜 ${fmt(ev.end)}` : ""}
        </div>

        {/* Google Meet */}
        <div style={{ border: `1px solid ${C.inkSofter}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12.5, color: C.paper, fontWeight: 600, marginBottom: 10 }}>Google Meet</div>
          {meet ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#2E5AA8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meet}</span>
              <button onClick={() => navigator.clipboard?.writeText(meet)} style={{ ...miniBtn, width: "auto", padding: "6px 10px", fontSize: 12, color: C.dim }}>コピー</button>
            </div>
          ) : (
            <button onClick={issueMeet} disabled={issuing} style={{ ...primaryBtn, marginTop: 0, width: "100%", justifyContent: "center" }}>
              {issuing ? <><Loader size={15} className="spin" /> 発行中…</> : <>＋ Meetリンクを発行</>}
            </button>
          )}
          <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 8 }}>
            ※ プレビューではダミーURLを発行します。本番ではGoogle Calendar API経由で実発行されます。
          </div>
        </div>
      </div>
    </>
  );
}

// 月表示：単日はセル内帯、複数日はまたがる連続バー
function MonthGrid({ monthDates, cursor, onDay, colorOf, timeOf, sel, setSel, onOpenItem, newOn }) {
  const CELL_MIN_H = 72;  // セルの最小高さ（下限）。予定が多い日はこれを超えて縦に伸びる
  const BAR_H = 14;       // またがりバーの高さ
  // 7個ずつの週に分割
  const weeks = [];
  for (let i = 0; i < monthDates.length; i += 7) weeks.push(monthDates.slice(i, i + 7));

  return (
    <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, padding: 8, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", marginBottom: 4 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10.5, color: C.dimmer, padding: "2px 0" }}>{d}</div>)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {weeks.map((week, wi) => {
          // この週に含まれる実在日
          const validDays = week.filter(Boolean);
          if (validDays.length === 0) return <div key={wi} />;
          const weekStartDate = validDays[0];
          const weekEndDate = validDays[validDays.length - 1];

          // この週にかかる「またがり項目」を集め、週内のスパン(開始列・終了列)を計算
          const barItems = [];
          const seen = new Set();
          week.forEach((dt) => {
            if (!dt) return;
            onDay(dt).forEach(ev => {
              if (!isMultiDay(ev) || seen.has(ev.id)) return;
              // この週に重なるか
              if (ev.end.slice(0, 10) < ymd(weekStartDate) || ev.start.slice(0, 10) > ymd(weekEndDate)) return;
              seen.add(ev.id);
              // 週内での開始列・終了列（0-6）
              let cs = -1, ce = -1;
              week.forEach((d, idx) => {
                if (!d) return;
                const k = ymd(d);
                if (k >= ev.start.slice(0, 10) && k <= ev.end.slice(0, 10)) {
                  if (cs < 0) cs = idx;
                  ce = idx;
                }
              });
              if (cs < 0) return;
              barItems.push({ ev, cs, ce,
                startsHere: ev.start.startsWith(ymd(week[cs])),
                endsHere: ev.end.startsWith(ymd(week[ce])) });
            });
          });

          const barLayerH = barItems.length * (BAR_H + 2);

          return (
            <div key={wi} style={{ position: "relative" }}>
              {/* 日セル行 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2 }}>
                {week.map((dt, di) => {
                  if (!dt) return <div key={di} />;
                  const singles = onDay(dt).filter(ev => !isMultiDay(ev))
                    .sort((a, b) => timeOf(a, dt).localeCompare(timeOf(b, dt)));
                  const isSel = sameYMD(sel, dt);
                  return (
                    <div key={di} onClick={() => { isSel ? newOn(dt) : setSel(dt); }} style={{
                      minWidth: 0, minHeight: CELL_MIN_H, borderRadius: 8, padding: 3, cursor: "pointer",
                      background: isSel ? C.gold + "14" : "transparent",
                      border: `1px solid ${isSel ? C.gold + "55" : "transparent"}`,
                    }}>
                      <div style={{ textAlign: "center", fontSize: 11.5, marginBottom: 2,
                        color: isSel ? C.goldSoft : C.paper, fontWeight: isSel ? 700 : 400 }}>{dt.getDate()}</div>
                      {/* またがりバーのぶん空ける */}
                      <div style={{ height: barLayerH }} />
                      {/* 予定は打ち切らず全件表示。件数が多い日はセルが縦に伸びる（コンテンツ追従） */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        {singles.map(ev => {
                          const col = colorOf(ev);
                          return (
                            <div key={ev.id} onClick={(e) => { e.stopPropagation(); onOpenItem(ev.id); }} style={{
                              fontSize: 9.5, lineHeight: 1.3, padding: "1px 4px", borderRadius: 4, minWidth: 0, maxWidth: "100%",
                              background: `${col}22`, color: col, borderLeft: `2px solid ${col}`,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              textDecoration: ev.done ? "line-through" : "none",
                            }}>{ev.title}</div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* またがりバー層（日付ラベルの下に重ねる） */}
              <div style={{ position: "absolute", top: 20, left: 0, right: 0, pointerEvents: "none" }}>
                {barItems.map((bar, bi) => {
                  const col = colorOf(bar.ev);
                  const leftPct = (bar.cs / 7) * 100;
                  const widthPct = ((bar.ce - bar.cs + 1) / 7) * 100;
                  return (
                    <div key={bar.ev.id} onClick={() => onOpenItem(bar.ev.id)} style={{
                      position: "absolute", top: bi * (BAR_H + 2), height: BAR_H,
                      left: `calc(${leftPct}% + 3px)`, width: `calc(${widthPct}% - 6px)`,
                      background: `${col}30`, color: col, pointerEvents: "auto", cursor: "pointer",
                      borderTopLeftRadius: bar.startsHere ? 5 : 0, borderBottomLeftRadius: bar.startsHere ? 5 : 0,
                      borderTopRightRadius: bar.endsHere ? 5 : 0, borderBottomRightRadius: bar.endsHere ? 5 : 0,
                      borderLeft: bar.startsHere ? `3px solid ${col}` : "none",
                      fontSize: 9, lineHeight: `${BAR_H}px`, padding: "0 5px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{bar.startsHere ? bar.ev.title : "◂ " + bar.ev.title}</div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 週表示：終日エリア＋時間軸グリッド（矩形を時間帯の位置・高さで配置）
function WeekTimeline({ weekDates, onDay, colorOf, timeOf, isAllDay, sel, setSel, onOpenItem, newOn, allItems }) {
  const days = weekDates;
  const HOUR_H = 40;              // 1時間の高さ(px)
  // 表示時間帯は既定 7:00-22:00。ただし週内の時刻付き予定に合わせて動的に拡張し、
  // 早朝・深夜の予定が範囲外で切れないようにする（コンテンツ追従）。
  const DEFAULT_START_H = 7, DEFAULT_END_H = 22;
  let minH = DEFAULT_START_H, maxH = DEFAULT_END_H;
  days.forEach(dt => {
    const k = ymd(dt);
    onDay(dt).filter(ev => !isAllDay(ev) && !isMultiDay(ev)).forEach(ev => {
      const s = ev.start && ev.start.startsWith(k) && ev.start.includes("T") ? ev.start.split("T")[1] : null;
      const e = ev.end && ev.end.startsWith(k) && ev.end.includes("T") ? ev.end.split("T")[1] : null;
      if (s) { const h = parseInt(s.split(":")[0], 10); if (h < minH) minH = h; }
      if (e) { const [eh, em] = e.split(":").map(Number); const ceil = em > 0 ? eh + 1 : eh; if (ceil > maxH) maxH = ceil; }
    });
  });
  const START_H = Math.max(0, minH);
  const END_H = Math.min(24, Math.max(maxH, START_H + 1));
  const hours = [];
  for (let h = START_H; h <= END_H; h++) hours.push(h);
  const gridH = (END_H - START_H) * HOUR_H;

  // 時刻文字列 "HH:MM" → START_H基準のpx位置
  const toY = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return ((h - START_H) + m / 60) * HOUR_H;
  };
  // 予定の矩形情報（start/end が同日にある前提で高さを算出。無ければ既定30分）
  function rect(ev, dt) {
    const k = ymd(dt);
    const s = ev.start && ev.start.startsWith(k) && ev.start.includes("T") ? ev.start.split("T")[1] : null;
    const e = ev.end && ev.end.startsWith(k) && ev.end.includes("T") ? ev.end.split("T")[1] : null;
    let top = toY(s);
    let bottom = toY(e);
    if (top == null && bottom == null) return null;
    if (top == null) top = (bottom ?? 0) - HOUR_H / 2;   // 開始不明→30分前
    if (bottom == null) bottom = top + HOUR_H / 2;        // 終了不明→30分
    const height = Math.max(16, bottom - top);
    return { top: Math.max(0, top), height };
  }

  // 重なり配置：その日の時刻あり予定に「列(lane)」を割り当て、重なりを横に分割する。
  // list は {ev, r:{top,height}} を top→bottom 順にソート済みで渡す。
  // 返り値は各要素に col（列番号）と cols（そのかたまりの総列数）を付与したもの。
  function assignColumns(list) {
    const out = [];
    let cluster = [];       // 現在の「重なりのかたまり」に属する要素
    let clusterEnd = -1;    // かたまり内の最大 bottom
    let colEnds = [];       // 各列の最後の予定の bottom
    const flush = () => {
      const cols = colEnds.length || 1;
      cluster.forEach(it => { it.cols = cols; });
      cluster = []; colEnds = []; clusterEnd = -1;
    };
    for (const x of list) {
      const top = x.r.top;
      const bottom = x.r.top + x.r.height;
      if (cluster.length && top >= clusterEnd) flush(); // どの予定とも重ならない→新しいかたまり
      // 空いている列（その列の最後の予定が現在の開始までに終わっている）を探す
      let col = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= top) { col = c; break; }
      }
      if (col < 0) { col = colEnds.length; colEnds.push(bottom); }
      else colEnds[col] = bottom;
      const item = { ...x, col, cols: 1 };
      cluster.push(item);
      out.push(item);
      clusterEnd = Math.max(clusterEnd, bottom);
    }
    flush();
    return out;
  }

  // 終日エリアに出すバー（複数日またがり ＋ 時刻なし終日項目）
  const weekStartYmd = ymd(days[0]);
  const weekEndYmd = ymd(days[6]);
  const barItems = [];
  const seen = new Set();
  days.forEach(dt => {
    allItems.forEach(ev => {
      if (seen.has(ev.id)) return;
      const multi = isMultiDay(ev);
      const allday = isAllDay(ev);
      if (!multi && !allday) return;
      if (!spans(ev, dt)) return;
      seen.add(ev.id);
      // 週内の開始列・終了列
      let cs = -1, ce = -1;
      days.forEach((d, idx) => {
        if (spans(ev, d)) { if (cs < 0) cs = idx; ce = idx; }
      });
      if (cs < 0) return;
      barItems.push({ ev, cs, ce,
        startsHere: multi ? ev.start.slice(0, 10) >= weekStartYmd && ev.start.startsWith(ymd(days[cs])) : true,
        endsHere: multi ? ev.end.slice(0, 10) <= weekEndYmd && ev.end.startsWith(ymd(days[ce])) : true });
    });
  });
  const BAR_H = 15;
  const allDayLayerH = Math.max(22, barItems.length * (BAR_H + 2) + 4);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
      background: C.inkSoft, borderTop: `1px solid ${C.inkSofter}`, overflow: "hidden" }}>
      {/* 日ヘッダー */}
      <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7,minmax(0,1fr))", borderBottom: `1px solid ${C.inkSofter}` }}>
        <div />
        {days.map((dt, i) => {
          const on = sameYMD(sel, dt);
          return (
            <button key={i} onClick={() => { on ? newOn(dt) : setSel(dt); }} style={{
              border: "none", background: "transparent", cursor: "pointer",
              padding: "6px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 10, color: C.dimmer }}>{DOW[dt.getDay()]}</span>
              <span style={{ fontSize: 14, fontWeight: on ? 700 : 500,
                color: on ? C.onAccent : C.paper,
                background: on ? C.gold : "transparent", width: 24, height: 24,
                borderRadius: 99, display: "grid", placeItems: "center" }}>{dt.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* 終日／またがりバー エリア */}
      <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7,minmax(0,1fr))", borderBottom: `1px solid ${C.inkSofter}`, position: "relative", height: allDayLayerH }}>
        <div style={{ fontSize: 8.5, color: C.dimmer, display: "grid", placeItems: "center" }}>終日</div>
        {days.map((dt, i) => (
          <div key={i} style={{ minWidth: 0, borderLeft: `1px solid ${C.line}` }} />
        ))}
        {/* バー層：36pxラベル列の右側に絶対配置 */}
        <div style={{ position: "absolute", top: 2, left: 36, right: 0, bottom: 2, pointerEvents: "none" }}>
          {barItems.map((bar, bi) => {
            const col = colorOf(bar.ev);
            const leftPct = (bar.cs / 7) * 100;
            const widthPct = ((bar.ce - bar.cs + 1) / 7) * 100;
            return (
              <div key={bar.ev.id} onClick={() => onOpenItem(bar.ev.id)} style={{
                position: "absolute", top: bi * (BAR_H + 2), height: BAR_H,
                left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                background: `${col}30`, color: col, pointerEvents: "auto", cursor: "pointer",
                borderTopLeftRadius: bar.startsHere ? 5 : 0, borderBottomLeftRadius: bar.startsHere ? 5 : 0,
                borderTopRightRadius: bar.endsHere ? 5 : 0, borderBottomRightRadius: bar.endsHere ? 5 : 0,
                borderLeft: bar.startsHere ? `3px solid ${col}` : "none",
                fontSize: 9, lineHeight: `${BAR_H}px`, padding: "0 5px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{bar.startsHere ? bar.ev.title : "◂ " + bar.ev.title}</div>
            );
          })}
        </div>
      </div>

      {/* 時間軸グリッド（スクロール） */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7,minmax(0,1fr))", position: "relative" }}>
          {/* 時刻ラベル列 */}
          <div style={{ position: "relative", height: gridH }}>
            {hours.map((h, idx) => (
              <div key={h} style={{ position: "absolute", top: idx * HOUR_H - 6, right: 4, fontSize: 9, color: C.dimmer }}>
                {h}:00
              </div>
            ))}
          </div>
          {/* 各日カラム */}
          {days.map((dt, i) => {
            // その日の時刻あり予定を矩形化し、top→bottom 順にソートしてから列を割り当てる
            const laid = assignColumns(
              onDay(dt).filter(ev => !isAllDay(ev) && !isMultiDay(ev))
                .map(ev => ({ ev, r: rect(ev, dt) }))
                .filter(x => x.r)
                .sort((a, b) => a.r.top - b.r.top || (a.r.top + a.r.height) - (b.r.top + b.r.height))
            );
            return (
              <div key={i} style={{ position: "relative", height: gridH, borderLeft: `1px solid ${C.line}` }}>
                {/* 時間の横罫線 */}
                {hours.map((h, idx) => (
                  <div key={h} style={{ position: "absolute", top: idx * HOUR_H, left: 0, right: 0, borderTop: `1px solid ${C.line}` }} />
                ))}
                {/* 予定矩形（重なりは列に分割して横並び。重ならなければ全幅） */}
                {laid.map(({ ev, r, col, cols }) => {
                  const c = colorOf(ev);
                  const w = 100 / cols; // 1列あたりの割合
                  return (
                    <div key={ev.id} onClick={() => onOpenItem(ev.id)} style={{
                      position: "absolute", top: r.top, height: r.height,
                      left: `calc(${col * w}% + 2px)`, width: `calc(${w}% - 4px)`,
                      background: `${c}26`, borderLeft: `3px solid ${c}`, borderRadius: 5,
                      padding: "2px 4px", overflow: "hidden", cursor: "pointer", zIndex: 1,
                    }}>
                      <div style={{ fontSize: 9.5, color: c, fontWeight: 600, lineHeight: 1.2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textDecoration: ev.done ? "line-through" : "none" }}>{ev.title}</div>
                      {r.height > 28 && <div style={{ fontSize: 8.5, color: c, opacity: 0.8 }}>{timeOf(ev, dt)}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 小物 ──
// 自動で高さが伸びるテキストエリア（入力量に応じて拡張。最小高さはrowsで指定）
// 日時入力（終日チェック内包・時刻は15分刻み）。start/end 文字列を受け取り onChange(start,end) で返す。
// 終日=日付のみ "YYYY-MM-DD" / 時刻あり="YYYY-MM-DDTHH:MM"
function DateTimeField({ start, end, onChange }) {
  const allDay = !((start || "").includes("T") || (end || "").includes("T"));
  const setAllDay = (v) => {
    if (v) {
      onChange(start ? start.slice(0, 10) : "", end ? end.slice(0, 10) : "");
    } else {
      onChange(start ? start.slice(0, 10) + "T09:00" : "", end ? end.slice(0, 10) + "T10:00" : "");
    }
  };
  return (
    <div style={{ border: `1px solid ${C.inkSofter}`, borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 8, background: C.inkSoft }}>
      {/* 終日チェック（UIの中に配置） */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", alignSelf: "flex-start" }}>
        <span onClick={() => setAllDay(!allDay)} style={{ width: 18, height: 18, borderRadius: 5, display: "grid", placeItems: "center",
          border: `1.5px solid ${allDay ? C.gold : C.dimmer}`, background: allDay ? C.gold : "transparent" }}>
          {allDay && <Check size={12} color={C.onAccent} strokeWidth={3} />}
        </span>
        <span style={{ fontSize: 13, color: allDay ? C.goldSoft : C.dim, fontWeight: allDay ? 600 : 400 }} onClick={() => setAllDay(!allDay)}>終日</span>
      </label>
      {/* 開始・終了 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.dimmer, width: 30, flexShrink: 0 }}>開始</span>
          {allDay
            ? <input type="date" value={start ? start.slice(0, 10) : ""} onChange={e => onChange(e.target.value, end)} style={dtStyle} />
            : <input type="datetime-local" step="900" value={start || ""} onChange={e => onChange(e.target.value, end)} style={dtStyle} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.dimmer, width: 30, flexShrink: 0 }}>終了</span>
          {allDay
            ? <input type="date" value={end ? end.slice(0, 10) : ""} onChange={e => onChange(start, e.target.value)} style={dtStyle} />
            : <input type="datetime-local" step="900" value={end || ""} onChange={e => onChange(start, e.target.value)} style={dtStyle} />}
        </div>
      </div>
    </div>
  );
}

// 自動で高さが伸びるテキストエリア。
//  rows    … 最小高さ（既定の表示行数）
//  maxRows … 高さ上限（この行数を超えたら固定して内部スクロール）。未指定なら無制限。
//  それ以外の props（onKeyDown 等）は textarea へ透過。
function AutoTextarea({ value, onChange, rows = 3, maxRows, placeholder, style, ...rest }) {
  const ref = useRef(null);
  const resize = (el) => {
    if (!el) return;
    if (!el.value) { el.style.height = ""; el.style.overflowY = "hidden"; return; } // 空ならrows既定高さに戻す
    el.style.height = "auto";
    // 上限（px）を maxRows と実際の行高・上下パディングから算出
    let cap = Infinity;
    if (maxRows) {
      const cs = window.getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
      const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      cap = lh * maxRows + padV;
    }
    const h = Math.min(el.scrollHeight, cap);
    el.style.height = h + "px";
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  };
  React.useEffect(() => { resize(ref.current); }, [value]);
  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => { onChange(e); resize(e.target); }}
      style={{ ...style, overflow: "hidden" }}
    />
  );
}

function Field({ label, children, flex }) {
  return (
    <div style={{ flex: flex ? 1 : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Select({ value, onChange, options, small, colorize, allowEmpty }) {
  // 非表示ラベルは選択肢に出さない。ただし現在選択中の値は残す（既存項目の編集で消えないように）。
  const opts = options.filter(o => !o.hidden || o.id === value);
  const cur = opts.find(o => o.id === value);
  const col = colorize && cur && cur.color ? cur.color : null;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: "100%", borderRadius: small ? 8 : 10,
      padding: small ? "7px 8px" : "10px 12px", fontSize: small ? 12.5 : 14,
      outline: "none", appearance: "none", cursor: "pointer",
      background: col ? `${col}14` : C.ink,
      border: `1px solid ${col ? col + "66" : C.inkSofter}`,
      color: col || C.paper,
      fontWeight: col ? 600 : 400,
      ...(small ? { flex: 1, minWidth: 0 } : {}),
    }}>
      {allowEmpty && <option value="" style={{ background: C.inkSoft, color: C.dim, fontWeight: 400 }}>指定なし</option>}
      {opts.map(o => <option key={o.id} value={o.id} style={{ background: C.inkSoft, color: C.paper, fontWeight: 400 }}>{o.label}</option>)}
    </select>
  );
}

// ── 詳細パネル：その場で編集・保存・削除 ──
// テキストから http/https のURLを抽出（末尾の句読点・閉じ括弧は除去。重複は除く）
function extractUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/[^\s"'<>）)】」]+/g;
  const found = (text.match(re) || []).map(u => u.replace(/[.,。、)）】」]+$/, ""));
  return Array.from(new Set(found));
}
// URLから表示ラベルと種別（アイコン色分け用）を推定
function urlMeta(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname || "";
    if (host === "docs.google.com") {
      if (path.startsWith("/document")) return { label: "Google ドキュメント", kind: "doc" };
      if (path.startsWith("/spreadsheets")) return { label: "Google スプレッドシート", kind: "sheet" };
      if (path.startsWith("/presentation")) return { label: "Google スライド", kind: "slide" };
      return { label: "Google Docs", kind: "doc" };
    }
    if (host === "drive.google.com") return { label: "Google ドライブ", kind: "doc" };
    return { label: host, kind: "web" };
  } catch { return { label: url, kind: "web" }; }
}
// 詳細テキスト内のURLを、クリック可能なリンクチップとして表示（別タブ＋noopener）
function LinkChips({ text }) {
  const urls = extractUrls(text);
  if (!urls.length) return null;
  const bg = { doc: "#2E5AA8", sheet: "#3C7A5A", slide: "#C9A24B", web: "#6B7688" };
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, color: C.dimmer, margin: "0 2px 6px" }}>本文中のリンク（{urls.length}件）</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {urls.map((url, i) => {
          const m = urlMeta(url);
          const short = url.replace(/^https?:\/\//, "");
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{
              display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
              border: `1px solid ${C.inkSofter}`, background: C.inkSoft, borderRadius: 10, padding: "8px 10px", color: C.paper }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", flexShrink: 0, background: bg[m.kind] || bg.web }}>
                <FileText size={12} color="#fff" />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                <span style={{ display: "block", fontSize: 10.5, color: C.dimmer, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{short}</span>
              </span>
              <ExternalLink size={13} color={C.dimmer} style={{ flexShrink: 0 }} />
            </a>
          );
        })}
      </div>
    </div>
  );
}

// 一覧・カレンダー行に付ける小さな Zoom バッジ
function ZoomBadge({ small }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#2D8CFF14", color: "#0B5CFF",
      border: "1px solid #2D8CFF44", borderRadius: 999, padding: small ? "1px 6px" : "2px 8px", fontSize: small ? 10 : 11, fontWeight: 600, verticalAlign: "middle" }}>
      <Video size={small ? 10 : 11} color="#2D8CFF" /> Zoom
    </span>
  );
}

// 詳細パネル内の Zoom 会議情報ブロック（参加ボタン・会議ID・パスコード・コピー）
function ZoomMeetingBlock({ item }) {
  const [copied, setCopied] = useState("");
  const copy = (key, val) => {
    try { navigator.clipboard?.writeText(val || ""); setCopied(key); setTimeout(() => setCopied(""), 1200); } catch {}
  };
  const CopyBtn = ({ k, val }) => (
    <button onClick={() => copy(k, val)} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: C.link || "#2E5AA8",
      border: `1px solid ${C.inkSofter}`, borderRadius: 7, padding: "2px 7px", cursor: "pointer", background: C.soft || "#fff" }}>
      <Copy size={11} /> {copied === k ? "コピー済" : "コピー"}
    </button>
  );
  return (
    <div style={{ border: "1px solid #2D8CFF40", background: "linear-gradient(180deg,#2D8CFF0F,#2D8CFF05)", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <ZoomBadge />
        <a href={item.zoomJoinUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#2D8CFF", color: "#fff", textDecoration: "none",
            padding: "7px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 600 }}>
          参加する <ExternalLink size={13} />
        </a>
      </div>
      {item.zoomMeetingId ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderTop: `1px dashed ${C.inkSofter}`, fontSize: 12.5 }}>
          <span style={{ color: C.dim }}>会議ID</span>
          <span style={{ display: "flex", alignItems: "center", gap: 7, color: C.paper, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace" }}>{item.zoomMeetingId} <CopyBtn k="id" val={item.zoomMeetingId} /></span>
        </div>
      ) : null}
      {item.zoomPasscode ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderTop: `1px dashed ${C.inkSofter}`, fontSize: 12.5 }}>
          <span style={{ color: C.dim }}>パスコード</span>
          <span style={{ display: "flex", alignItems: "center", gap: 7, color: C.paper, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace" }}>{item.zoomPasscode} <CopyBtn k="pc" val={item.zoomPasscode} /></span>
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0 0", borderTop: `1px dashed ${C.inkSofter}`, fontSize: 12.5 }}>
        <span style={{ color: C.dim }}>リンク</span>
        <CopyBtn k="url" val={item.zoomJoinUrl} />
      </div>
    </div>
  );
}

function DetailPanel({ item, masters, onClose, onSave, onDelete, onDuplicate, onToggle, wide, zoom }) {
  // item が変わるたびにローカル編集状態を初期化
  const [draft, setDraft] = useState(item);
  const [zoomBusy, setZoomBusy] = useState(false);
  const [zoomErr, setZoomErr] = useState("");
  const fileInput = useRef(null);
  React.useEffect(() => { setDraft(item); }, [item.id]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);

  function pickFiles(e) {
    const names = Array.from(e.target.files || []).map(f => f.name);
    set({ files: [...draft.files, ...names] });
    e.target.value = "";
  }
  function renameFile(i) {
    const next = prompt("ファイル名を編集", draft.files[i]);
    if (next != null && next.trim()) set({ files: draft.files.map((f, idx) => idx === i ? next.trim() : f) });
  }

  // wide=true: 右パネル / false: 下からのシート
  const shell = wide
    ? { width: 380, flexShrink: 0, borderLeft: `1px solid ${C.inkSofter}`, height: "100%", display: "flex", flexDirection: "column", background: C.ink }
    : { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "88vh", borderRadius: "20px 20px 0 0",
        border: `1px solid ${C.inkSofter}`, display: "flex", flexDirection: "column", background: C.ink, zIndex: 50,
        boxShadow: "0 -12px 40px rgba(37,48,36,.22)", maxWidth: 440, margin: "0 auto" };

  return (
    <>
      {!wide && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(37,48,36,.35)", zIndex: 49 }} />}
      <div style={shell}>
        {/* ヘッダ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: `1px solid ${C.inkSofter}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: C.accent2 }} />
            <span style={{ fontSize: 13.5, color: C.paper, fontWeight: 700 }}>
              {draft.kind === "task" ? "タスクの詳細" : draft.kind === "memo" ? "メモの詳細" : "スケジュールの詳細"}
            </span>
          </div>
          <button onClick={onClose} style={miniBtn}><X size={15} color={C.dim} /></button>
        </div>

        {/* 本体（スクロール）— 入力画面とデザイン統一 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* 区分切替：登録後もタスク/メモ/スケジュールを変更可能（データは同一DB） */}
            <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
              {[["task", "タスク", ListChecks], ["memo", "メモ", StickyNote], ["event", "スケジュール", Cal]].map(([k, l, Ico]) => {
                const on = draft.kind === k;
                return (
                  <button key={k} onClick={() => set({ kind: k })} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0",
                    borderRadius: 10, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
                    border: `1px solid ${on ? C.gold + "66" : C.inkSofter}`,
                    background: on ? C.gold + "1A" : "transparent", color: on ? C.goldSoft : C.dim,
                  }}><Ico size={14} /> {l}</button>
                );
              })}
            </div>

            {draft.kind === "task" && (
              <button onClick={() => { onToggle(draft.id); set({ done: !draft.done }); }} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${draft.done ? C.mist + "55" : C.inkSofter}`,
                background: draft.done ? C.mist + "1A" : "transparent", color: draft.done ? C.mist : C.paper, fontSize: 13.5,
              }}>
                <span style={checkbox(draft.done)}>{draft.done && <Check size={13} color={C.onAccent} strokeWidth={3} />}</span>
                {draft.done ? "完了済み" : "未完了 — タップで完了に"}
              </button>
            )}

            <input value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="タイトル（1行で要点を）" style={inputStyle} />

            <div style={{ display: "flex", gap: 8 }}>
              {["A", "B", "C"].map(ax => (
                <Select key={ax} value={draft[ax]} onChange={v => set({ [ax]: v })} options={masters[ax].items} small colorize allowEmpty />
              ))}
            </div>

            <DateTimeField start={draft.start || ""} end={draft.end || ""} onChange={(s, e) => set({ start: s, end: e })} />

            {/* Zoom会議：予定に会議を紐づけ／表示（連携時のみ） */}
            {draft.kind === "event" && (
              draft.zoomJoinUrl ? (
                <ZoomMeetingBlock item={draft} />
              ) : zoom && zoom.connected ? (
                <div style={{ marginTop: 2 }}>
                  <button disabled={zoomBusy} onClick={async () => {
                    setZoomErr(""); setZoomBusy(true);
                    try {
                      const m = await zoom.createMeeting({ topic: draft.title || "会議", start: draft.start || "", end: draft.end || "" });
                      set({ zoomMeetingId: m.id, zoomJoinUrl: m.join_url, zoomPasscode: m.passcode });
                    } catch (e) { setZoomErr((e && e.message) || "Zoom会議の作成に失敗しました。"); }
                    finally { setZoomBusy(false); }
                  }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "11px 0",
                    borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: zoomBusy ? "default" : "pointer",
                    border: "1px solid #2D8CFF55", background: "#2D8CFF12", color: "#0B5CFF", opacity: zoomBusy ? 0.6 : 1 }}>
                    {zoomBusy ? <Loader size={14} className="spin" /> : <Video size={14} />} {zoomBusy ? "作成中…" : "Zoom会議を作成"}
                  </button>
                  <div style={{ fontSize: 11, color: C.dimmer, marginTop: 5 }}>作成後「保存」で予定に会議が紐づきます。</div>
                  {zoomErr && <div style={{ fontSize: 11.5, color: C.dawn, marginTop: 5 }}>{zoomErr}</div>}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 2 }}>設定 &gt; 連携カレンダー でZoomを接続すると、この予定にZoom会議を作成できます。</div>
              )
            )}

            {draft.kind !== "memo" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  <Bell size={13} color={C.dim} />
                  <span style={{ fontSize: 12, color: C.dim }}>通知（未設定なら全体設定に従う）</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button onClick={() => set({ notify: null })} style={pill(draft.notify == null)}>既定</button>
                  {NOTIFY_OPTIONS.map(o => (
                    <button key={o.v} onClick={() => set({ notify: o.v })} style={pill(draft.notify === o.v)}>{o.label}</button>
                  ))}
                </div>
              </div>
            )}

            <AutoTextarea value={draft.detail1} onChange={e => set({ detail1: e.target.value })} rows={3} placeholder="詳細1"
              style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />
            <AutoTextarea value={draft.detail2} onChange={e => set({ detail2: e.target.value })} rows={2} placeholder="詳細2（補足）"
              style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />

            {/* 詳細1・詳細2内のURLをクリック可能なリンクとして抽出表示（方法A） */}
            <LinkChips text={`${draft.detail1 || ""}\n${draft.detail2 || ""}`} />

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {draft.files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: C.ink,
                  border: `1px solid ${C.inkSofter}`, borderRadius: 10, padding: "8px 10px" }}>
                  <FileText size={14} color={C.dim} />
                  <span style={{ flex: 1, fontSize: 13, color: C.paper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f}</span>
                  <button onClick={() => renameFile(i)} style={miniBtn}><Pencil size={12} color={C.dim} /></button>
                  <button onClick={() => set({ files: draft.files.filter((_, idx) => idx !== i) })} style={miniBtn}><X size={12} color={C.dawn} /></button>
                </div>
              ))}
              <button onClick={() => fileInput.current?.click()} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px",
                borderRadius: 10, border: `1px dashed ${C.line}`, background: "transparent", color: C.dim, fontSize: 13, cursor: "pointer" }}>
                <Upload size={14} /> ファイルを追加
              </button>
              <input ref={fileInput} type="file" multiple onChange={pickFiles} style={{ display: "none" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => onDuplicate(draft)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px",
              borderRadius: 10, border: `1px solid ${C.mist}55`, background: `${C.mist}12`, color: C.mist, fontSize: 13, cursor: "pointer" }}>
              <Copy size={14} /> この{draft.kind === "task" ? "タスク" : draft.kind === "memo" ? "メモ" : "スケジュール"}を複製
            </button>
            <button onClick={() => onDelete(draft.id)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px",
              borderRadius: 10, border: `1px solid ${C.dawn}44`, background: "transparent", color: C.dawn, fontSize: 13, cursor: "pointer" }}>
              <Trash2 size={14} /> この{draft.kind === "task" ? "タスク" : draft.kind === "memo" ? "メモ" : "スケジュール"}を削除
            </button>
          </div>
        </div>

        {/* 保存バー */}
        <div style={{ padding: 14, borderTop: `1px solid ${C.inkSofter}`, display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...ghostBtnFull }}>閉じる</button>
          <button onClick={() => onSave(draft)} disabled={!dirty} style={{
            ...primaryBtn, marginTop: 0, flex: 1, justifyContent: "center", opacity: dirty ? 1 : 0.45,
            cursor: dirty ? "pointer" : "default" }}>
            <Check size={15} /> 保存
          </button>
        </div>
      </div>
    </>
  );
}

// ── ルート ──
export default function ManageMateApp({ onSignOut, userEmail }) {
  // items は Supabase と同期（フェーズ2: state → DB 永続化）
  const _itemsApi = useItems();
  const items = _itemsApi.items;
  // 分類マスタ・通知設定も Supabase と同期（ユーザーごと。新規ユーザーは分類ゼロから）
  const _settings = useSettings();
  const masters = _settings.masters;
  const setMasters = _settings.setMasters;
  const notifySettings = _settings.notifySettings;
  const setNotifySettings = _settings.setNotifySettings;
  // 初期表示設定（カレンダー/一覧の初期状態。ユーザーごとに永続化）
  const displayPrefs = _settings.displayPrefs;
  const saveDisplayPrefs = _settings.saveDisplayPrefs;
  const prefsReady = _settings.prefsReady;
  // 連携カレンダー：Google連携（フェーズ3）から取得
  const _gcal = useGoogleCalendar();
  const extCalendars = _gcal.calendars;
  // Zoom連携（接続状態＋会議作成）
  const _zoom = useZoom();
  const [screen, setScreen] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [notifyOpen, setNotifyOpen] = useState(false); // 通知センターの開閉
  const NOW = new Date().toISOString(); // 実時刻
  const notifications = buildNotifications(items, notifySettings, NOW);
  const unreadCount = notifications.filter(n => n.past).length; // 発火済み＝未読相当（デモ）
  const [captureStart, setCaptureStart] = useState(""); // カレンダーから日付指定で入力する際の初期開始日時
  const [captureDraft, setCaptureDraft] = useState(null); // 複製から入力画面へ渡す初期内容
  const [wide, setWide] = useState(false);

  // 画面幅で右パネル / 下シートを出し分け（880px以上で右パネル）
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 880px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange); };
  }, []);

  // OAuthコールバック等からの ?screen= で画面を開き、URLを整える
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sc = params.get("screen");
      if (sc) {
        setScreen(sc);
        params.delete("screen"); params.delete("gcal"); params.delete("zoom");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
      }
    } catch {}
  }, []);

  // ハンドラは useItems（Supabase同期）に委譲。UI都合の setSelectedId はここで付与。
  const toggle = _itemsApi.toggle;
  const addItem = _itemsApi.addItem;
  const addItems = _itemsApi.addItems;
  const updateByAI = _itemsApi.updateItem;   // AIチャットからの更新
  const deleteByAI = _itemsApi.deleteItems;  // AIチャットからの削除（複数id）
  const saveItem = (draft) => { _itemsApi.saveItem(draft); setSelectedId(null); };
  const deleteItem = (id) => { _itemsApi.deleteItem(id); setSelectedId(null); };
  // 複製：内容を入力フォームに反映して入力画面へ遷移。完了状態・IDは引き継がず、タイトルに「（コピー）」を付与
  const duplicateItem = (src) => {
    setCaptureDraft({
      kind: src.kind, title: (src.title || "") + "（コピー）",
      A: src.A, B: src.B, C: src.C,
      detail1: src.detail1, detail2: src.detail2,
      start: src.start, end: src.end,
      notify: src.notify ?? null,
      files: Array.isArray(src.files) ? [...src.files] : [],
    });
    setSelectedId(null);
    setScreen("capture");
  };

  const selected = items.find(i => i.id === selectedId) || null;

  const nav = [
    { id: "home", label: "ホーム", icon: Home },
    { id: "calendar", label: "カレンダー", icon: Cal },
    { id: "list", label: "一覧", icon: ListChecks },
    { id: "capture", label: "入力", icon: Plus },
    { id: "chat", label: "AI相談", icon: MessageCircle },
    { id: "settings", label: "設定", icon: Settings },
  ];

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: C.ink, display: "flex", justifyContent: "center",
      fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
      {/* 広い画面：左サイドナビ＋ワイド本文。狭い画面：中央1カラム＋下タブ */}
      <div style={{ display: "flex", width: "100%", maxWidth: wide ? (selected ? 1400 : 1160) : 440, transition: "max-width .2s", height: "100vh" }}>
        {wide && (
          <aside style={{ width: 224, flexShrink: 0, height: "100vh", background: C.inkSoft, borderRight: `1px solid ${C.inkSofter}`, display: "flex", flexDirection: "column", padding: "18px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 18px" }}>
              <Logo size={34} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}><span style={{ color: C.paper }}>Manage</span><span style={{ color: C.accent2 }}>Mate</span></div>
                <div style={{ fontSize: 9, color: C.dimmer }}>あなたの仕事を支える、AIパートナー</div>
              </div>
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {nav.map(n => {
                const active = screen === n.id || (n.id === "settings" && (screen === "master" || screen === "extcal" || screen === "notify" || screen === "initdisp"));
                const Icon = n.icon;
                return (
                  <button key={n.id} onClick={() => setScreen(n.id)} style={{
                    display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: active ? C.navyDeep : "transparent", color: active ? "#fff" : C.dim, textAlign: "left", fontSize: 13.5, fontWeight: active ? 600 : 500 }}>
                    <Icon size={18} color={active ? C.accent2 : C.dim} /> {n.label}
                  </button>
                );
              })}
            </nav>
            <div style={{ flex: 1 }} />
            <button onClick={() => setNotifyOpen(true)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.inkSofter}`, background: C.ink, cursor: "pointer", position: "relative", color: C.paper, fontSize: 13 }}>
              <Bell size={17} color={C.paper} /> 通知
              {unreadCount > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 999, background: C.dawn, color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px" }}>{unreadCount}</span>}
            </button>
          </aside>
        )}
        <div style={{ flex: 1, minWidth: 0, height: "100vh", overflow: "hidden",
          background: `radial-gradient(120% 40% at 50% 0%, #FFFFFF 0%, ${C.ink} 60%)`,
          display: "flex", flexDirection: "column" }}>

          {screen !== "calendar" && !wide && (
          <header style={{ padding: "20px 20px 8px", display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>
                <span style={{ color: C.paper }}>Manage</span><span style={{ color: C.accent2 }}>Mate</span>
              </div>
              <div style={{ fontSize: 10.5, color: C.dimmer }}>あなたの仕事を支える、AIパートナー</div>
            </div>
            {/* 通知ベル */}
            <button onClick={() => setNotifyOpen(true)} style={{ position: "relative", width: 38, height: 38, borderRadius: 11,
              border: `1px solid ${C.inkSofter}`, background: C.inkSoft, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
              <Bell size={18} color={C.paper} />
              {unreadCount > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17,
                borderRadius: 999, background: C.dawn, color: "#fff", fontSize: 10, fontWeight: 700,
                display: "grid", placeItems: "center", padding: "0 4px" }}>{unreadCount}</span>}
            </button>
          </header>
          )}

          <main style={{ flex: 1, padding: screen === "calendar" ? "0" : "10px 18px 16px", overflowY: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
            {screen === "chat" ? (
              <div style={{ width: "100%", maxWidth: wide ? 820 : "none", margin: "0 auto", height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
              <ChatScreen masters={masters} items={items} onAddItems={addItems} onUpdateItem={updateByAI} onDeleteItems={deleteByAI} onOpenItem={setSelectedId} />
              </div>
            ) : screen === "calendar" ? (
              <CalendarScreen key={`cal-${prefsReady}`} items={items} masters={masters} onOpenItem={setSelectedId} extCalendars={extCalendars}
                displayPrefs={displayPrefs}
                onNewOnDate={(isoDate) => { setCaptureStart(isoDate); setScreen("capture"); }} />
            ) : (
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", margin: "-10px -18px -16px", padding: "10px 18px 16px" }}>
                  <div style={{ maxWidth: wide ? 980 : "none", margin: "0 auto", width: "100%" }}>
                  {screen === "home" && <HomeScreen items={items} masters={masters} onOpen={setSelectedId} onGoto={setScreen} wide={wide} />}
                  {screen === "list" && <ListScreen key={`list-${prefsReady}`} items={items} masters={masters} onToggle={toggle} onOpen={setSelectedId} selectedId={selectedId} wide={wide} displayPrefs={displayPrefs} />}
                  {screen === "capture" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><CaptureScreen masters={masters} onAddItem={addItem} zoom={_zoom} initialStart={captureStart} onConsumeInitial={() => setCaptureStart("")} initialDraft={captureDraft} onConsumeInitialDraft={() => setCaptureDraft(null)} /></div>}
                  {screen === "settings" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><SettingsScreen onGotoMaster={() => setScreen("master")} onGotoExtCal={() => setScreen("extcal")} onGotoNotify={() => setScreen("notify")} onGotoInitDisp={() => setScreen("initdisp")} extCalendars={extCalendars} notifySettings={notifySettings} onSignOut={onSignOut} userEmail={userEmail} /></div>}
                  {screen === "initdisp" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><InitialDisplaySettingsScreen displayPrefs={displayPrefs} onSave={saveDisplayPrefs} onBack={() => setScreen("settings")} /></div>}
                  {screen === "master" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><MasterScreen masters={masters} setMasters={setMasters} onBack={() => setScreen("settings")} /></div>}
                  {screen === "extcal" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><ExtCalendarScreen extCalendars={extCalendars} connected={_gcal.connected} email={_gcal.email} loading={_gcal.loading} onConnect={_gcal.connect} onDisconnect={_gcal.disconnect} onSavePref={_gcal.savePref} zoom={_zoom} onBack={() => setScreen("settings")} /></div>}
                  {screen === "notify" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><NotifySettingsScreen settings={notifySettings} setSettings={setNotifySettings} onBack={() => setScreen("settings")} /></div>}
                  </div>
                </div>
              )}
          </main>

          {!wide && (
          <nav style={{ flexShrink: 0, display: "flex", padding: "8px 8px 20px", borderTop: `1px solid ${C.inkSofter}`,
            background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}>
            {nav.map(n => {
              const active = screen === n.id || (n.id === "settings" && (screen === "master" || screen === "extcal" || screen === "notify" || screen === "initdisp")); const Icon = n.icon; const isCapture = n.id === "capture";
              return (
                <button key={n.id} onClick={() => setScreen(n.id)} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  padding: "6px 0", border: "none", background: "transparent", cursor: "pointer",
                  color: active ? C.paper : C.dimmer }}>
                  <div style={isCapture ? { width: 38, height: 38, borderRadius: 13, marginTop: -3,
                    background: C.navyDeep, display: "grid", placeItems: "center",
                    boxShadow: `0 4px 10px ${C.navyDeep}44`, border: `1px solid ${C.accent2}66` }
                    : { display: "grid", placeItems: "center", height: 24 }}>
                    <Icon size={isCapture ? 19 : 20} color={isCapture ? C.accent2 : (active ? C.paper : C.dimmer)} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{n.label}</span>
                </button>
              );
            })}
          </nav>
          )}
        </div>

        {/* 詳細パネル：広い画面は右に並べ、狭い画面は下シート */}
        {selected && wide && (
          <DetailPanel item={selected} masters={masters} wide zoom={_zoom}
            onClose={() => setSelectedId(null)} onSave={saveItem} onDelete={deleteItem} onDuplicate={duplicateItem} onToggle={toggle} />
        )}
      </div>

      {/* 狭い画面用の下シート（全幅オーバーレイ） */}
      {selected && !wide && (
        <DetailPanel item={selected} masters={masters} wide={false} zoom={_zoom}
          onClose={() => setSelectedId(null)} onSave={saveItem} onDelete={deleteItem} onDuplicate={duplicateItem} onToggle={toggle} />
      )}

      {notifyOpen && (
        <NotifyCenter notifications={notifications} settings={notifySettings}
          onClose={() => setNotifyOpen(false)} onOpenItem={setSelectedId} />
      )}
    </div>
  );
}

// ── スタイル ──
const meta = { fontSize: 12, color: C.dim, display: "inline-flex", gap: 4, alignItems: "center" };
const iconBtn = { width: 36, height: 36, borderRadius: 11, border: `1px solid ${C.inkSofter}`,
  background: C.inkSoft, display: "grid", placeItems: "center", cursor: "pointer" };
const miniBtn = { width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.inkSofter}`,
  background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 };
const searchBar = { display: "flex", alignItems: "center", gap: 8, background: C.inkSoft,
  border: `1px solid ${C.inkSofter}`, borderRadius: 12, padding: "10px 14px" };
const cardBox = { background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, padding: 16,
  boxShadow: "0 1px 3px rgba(27,42,74,0.05)" };
const inputStyle = { width: "100%", background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 10,
  padding: "10px 12px", color: C.paper, fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
const dtStyle = { width: "100%", background: C.ink, border: `1px solid ${C.inkSofter}`, borderRadius: 10,
  padding: "9px 10px", color: C.paper, fontSize: 12.5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
const primaryBtn = { marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6,
  background: C.gold, color: C.onAccent, border: "none", padding: "12px 18px", borderRadius: 11,
  fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtnFull = { padding: "12px 16px", borderRadius: 11, border: `1px solid ${C.inkSofter}`,
  background: "transparent", color: C.dim, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" };
const checkbox = (done) => ({ marginTop: 2, width: 22, height: 22, borderRadius: 7, flexShrink: 0,
  border: `1.5px solid ${done ? C.mist : C.dim}`, background: done ? C.mist : "transparent",
  display: "grid", placeItems: "center", cursor: "pointer" });
const chip = (active) => ({ padding: "7px 13px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
  border: `1px solid ${active ? C.gold + "55" : C.inkSofter}`,
  background: active ? C.gold + "14" : "transparent", color: active ? C.goldSoft : C.dim, whiteSpace: "nowrap" });
const pill = (on) => ({ padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${on ? C.gold + "66" : C.inkSofter}`, background: on ? C.gold + "1A" : "transparent",
  color: on ? C.goldSoft : C.dim, fontWeight: on ? 600 : 400 });
const bigToggle = (active) => ({ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
  padding: "11px 0", borderRadius: 12, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${active ? C.gold + "55" : C.inkSofter}`,
  background: active ? C.gold + "14" : "transparent", color: active ? C.goldSoft : C.dim });
