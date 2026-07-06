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
//   - window.claude.complete → 自前APIエンドポイント（フェーズ3）
//   - React state → Supabase（フェーズ2）
//   - デモ基準日 "2026-06-29" 固定 → 実日付
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef } from "react";
import { useItems } from "@/lib/useItems";
import { useSettings } from "@/lib/useSettings";
import {
  Check, Clock, Plus, Send, ListChecks, StickyNote, Calendar as Cal,
  ChevronLeft, ChevronRight, Search, Pin, Tag,
  Database, Paperclip, X, Pencil, Trash2, Bold, Palette, FileText, Upload,
  Sparkles, Loader, Wand2, ArrowLeft, MessageCircle, CornerDownLeft, Settings, LogOut,
  Home, Star, Bell, Sun, TrendingUp, ChevronRight as ChevR, Sliders
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

// 区分による色分け（①）。タスク=ネイビー(能動)/メモ=スレートグレー(記録)/スケジュール=ゴールド(予定)
const KIND_COLOR = { task: "#2E5AA8", memo: "#6B7688", event: "#C9A24B" };
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
      background: kindMode ? `${kindColor}0E` : (bgSource ? `${bgSource.color}14` : C.inkSoft),
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

  // 最優先タスク：分類Cが最優先(装飾bold/bg)なものを優先、なければ先頭
  // 【本番】この選定ロジックを AI 応答（priorityId）で置き換える
  const priority = openTasks.find(t => {
    const c = lookup(masters, "C", t.C);
    return c && (c.deco.bold || c.deco.bg);
  }) || openTasks[0];

  // 【本番】"2026-06-29" を実際の今日（new Date()）に置き換え、下の timed を today で絞り込む
  const TODAY = "2026-06-29"; // デモの基準日
  // 今日の予定：時刻を持つ項目を時刻順に上位4件
  // 【本番】.filter(i => (i.start||"").startsWith(today)) を有効化して当日のみ表示
  const timed = items.filter(i => i.start /* && i.start.startsWith(TODAY) */)
    .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  const fmtTime = (v) => (v && v.includes("T")) ? v.split("T")[1] : "";
  const fmtDate = (v) => { if (!v) return ""; const [, m, d] = v.slice(0, 10).split("-"); return `${parseInt(m)}/${parseInt(d)}`; };

  // 週の棒グラフ（ダミー値）
  // 【本番】日別の「完了タスク数」等を集計して { d, v } に格納（v は 0〜1 に正規化）
  const week = [{ d: "月", v: 0.8 }, { d: "火", v: 1.0 }, { d: "水", v: 0.6 }, { d: "木", v: 0.9 }, { d: "金", v: 0.7 }, { d: "土", v: 0.3 }, { d: "日", v: 0.4 }];

  const hour = 9; // ダミー。【本番】new Date().getHours() に置き換え
  const greet = hour < 11 ? "おはようございます" : hour < 17 ? "こんにちは" : "こんばんは";

  // 【本番】AI提案文はここでバックエンドから取得したテキストを使う（下の固定文言を置換）
  const aiAdvice = priority
    ? `最優先の「${priority.title}」を午前中に仕上げると、午後の予定に余裕を持って臨めます。`
    : "今日のタスクを整理して、優先度の高いものから着手しましょう。";

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

      {/* 本日の最優先タスク */}
      {priority && (
        <div style={{ ...cardBox, gridColumn: wide ? "1 / -1" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13.5, color: C.paper, fontWeight: 700 }}>本日の最優先タスク</span>
            <span style={{ fontSize: 10.5, color: C.navyDeep, background: C.accent2 + "2A", padding: "2px 8px", borderRadius: 999 }}>AIが選定</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
            </div>
            <Ring pct={70} size={62} color={C.accent2}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.paper }}>70%</span>
            </Ring>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
            <button onClick={() => onOpen(priority.id)} style={{ ...primaryBtn, marginTop: 0, padding: "10px 16px" }}>タスクを始める</button>
            <button onClick={() => onOpen(priority.id)} style={{ background: "none", border: "none", color: C.dim, fontSize: 13, cursor: "pointer" }}>詳細を見る</button>
          </div>
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
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
          {aiAdvice}
        </p>
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

function ListScreen({ items, masters, onToggle, onOpen, selectedId, wide }) {
  const [kindFilter, setKindFilter] = useState("all"); // all | task | memo | event
  const [showDone, setShowDone] = useState(false);     // 完了も表示するか（全区分共通、既定：未完了のみ）
  const [showPast, setShowPast] = useState(false);     // 過去の予定も表示するか（スケジュール、既定：非表示）
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false); // 検索バー展開
  const [showSheet, setShowSheet] = useState(false);   // 詳細フィルタ（分類・並び替え）シート
  const [fA, setFA] = useState("");  // 分類Aフィルタ（""=指定なし）
  const [fB, setFB] = useState("");
  const [fC, setFC] = useState("");
  const [sort, setSort] = useState("default"); // default | startAsc | dueAsc | created | classA | classB | classC
  const [sortDir, setSortDir] = useState("asc"); // asc | desc（デフォルト以外で有効）
  const [colorMode, setColorMode] = useState("class"); // class（②分類、既定）| kind（①区分）

  const TODAY = "2026-06-29"; // デモの基準日（本番は実際の今日）

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
          onReset: () => { setFA(""); setFB(""); setFC(""); setSort("default"); setSortDir("asc"); setColorMode("class"); } }} />
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
        {masters[ax].items.map(o => {
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
                <button onClick={() => setColorMode("class")} style={pill(colorMode === "class")}>分類A/B/Cの色</button>
                <button onClick={() => setColorMode("kind")} style={pill(colorMode === "kind")}>区分の色</button>
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

// ── AI振り分け：自然文 → タスク/メモ判定・分類・タイトル・詳細 ──
// ユーザー定義の分類マスタを渡し、その中の id から選ばせる（勝手な分類を作らせない）。
// プレビュー環境では window.claude.complete を使用。
// 本番では自分のバックエンド経由で Anthropic API を呼ぶ形に差し替える
//   （APIキーは必ずサーバ側の環境変数に置く。フロントに置かない）。
async function analyzeWithAI(text, masters) {
  const axisDesc = ["A", "B", "C"].map(ax =>
    `分類${ax}（${masters[ax].name}）の選択肢: ` +
    masters[ax].items.map(it => `{id:"${it.id}", label:"${it.label}"}`).join(", ")
  ).join("\n");

  const prompt = `あなたはタスク管理秘書です。次の入力文を解析し、JSONだけを返してください。前置きやコードフェンスは不要です。

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

  const raw = await window.claude.complete(prompt);
  const parsed = parseAIJson(raw);

  // 返ってきた id がマスタに存在するか検証。なければ先頭にフォールバック
  const valid = (ax, id) => masters[ax].items.some(it => it.id === id) ? id : masters[ax].items[0].id;
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
  const a0 = masters.A.items[0].id, b0 = masters.B.items[0].id, c0 = masters.C.items[0].id;

  // 日付表現をざっくり解釈（基準日 2026-06-29）
  const base = new Date(2026, 5, 29);
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
// 本番では window.claude.complete を自分のバックエンド経由のAPI呼び出しに差し替える。
async function chatWithAI(history, userText, masters, items, hasFiles) {
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

  const prompt = `あなたは「ManageMate」という名のタスク管理アシスタントです。ユーザーと自然に会話しつつ、必要に応じてタスク/メモ/予定の登録・修正・検索を行います。

【分類マスタ（登録・修正時はこのidから選ぶ。勝手に作らない）】
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
- 日時は "YYYY-MM-DDTHH:MM"（終日は "YYYY-MM-DD"）。今日は2026-06-29とする。曜日計算は正確に行う。
- replyは常に必須。何をしたか一言添える。`;

  // window.claude.complete が使えない環境では、簡易ルールでローカル応答を返す
  if (typeof window === "undefined" || !window.claude || typeof window.claude.complete !== "function") {
    return localFallbackChat(userText, masters, items);
  }
  let raw;
  try {
    raw = await window.claude.complete(prompt);
  } catch (e) {
    // プレビュー基盤側のエラー（Invalid response format 等）— ローカル簡易応答にフォールバック
    return localFallbackChat(userText, masters, items);
  }
  let parsed;
  try {
    parsed = parseAIJson(raw);
  } catch (e) {
    // JSONとして解釈できない場合は、生テキストを返答として扱い、アクションなしにする
    const fallback = (raw || "").replace(/```json|```/g, "").trim();
    return { reply: fallback || "うまく解析できませんでした。表現を変えてもう一度試してください。", action: null };
  }

  const validAx = (ax, id) => masters[ax].items.some(it => it.id === id) ? id : masters[ax].items[0].id;

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

  function pickFiles(e) {
    // 【本番差し替え】プレビューはファイル名のみ扱う。本番ではファイル本体をアップロードし、
    // バックエンド経由で画像/PDFをAnthropic APIに添付して中身を解析する。
    const names = Array.from(e.target.files || []).map(f => f.name);
    setAttachments(prev => [...prev, ...names]);
    e.target.value = "";
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    const files = attachments;
    const history = messages.map(m => ({ role: m.role === "user" ? "user" : "ai", text: m.text }));
    // 送信メッセージにファイル情報を含める（本文にも添えてAIに伝える）
    const textForAI = files.length
      ? `${text}${text ? "\n" : ""}[添付ファイル: ${files.join(", ")}]`
      : text;
    setMessages(m => [...m, { role: "user", text, files }]);
    setInput(""); setAttachments([]); setBusy(true);
    try {
      const { reply, action } = await chatWithAI(history, textForAI, masters, items, files.length > 0);
      setMessages(m => [...m, { role: "ai", text: reply, action }]);
    } catch (e) {
      setMessages(m => [...m, { role: "ai", text: "うまく処理できませんでした。もう一度試してください。" }]);
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
                {m.files.map((f, fi) => (
                  <span key={fi} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5,
                    background: C.gold + "14", border: `1px solid ${C.gold}33`, borderRadius: 999, padding: "4px 10px", color: C.goldSoft, maxWidth: 200 }}>
                    <FileText size={11} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f}</span>
                  </span>
                ))}
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
          {attachments.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
              background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 999, padding: "5px 10px", color: C.paper, maxWidth: 200 }}>
              <FileText size={12} color={C.dim} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f}</span>
              <X size={12} color={C.dim} style={{ cursor: "pointer", flexShrink: 0 }}
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} />
            </span>
          ))}
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
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          rows={1} placeholder="メッセージ（⌘/Ctrl+Enterで送信）"
          style={{ ...inputStyle, resize: "none", maxHeight: 120, lineHeight: 1.6 }} />
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
function CaptureScreen({ masters, onAddItem, initialStart, onConsumeInitial }) {
  const [recKind, setRecKind] = useState("task"); // task | memo | event（登録する区分）
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

  function pickFiles(e) {
    const names = Array.from(e.target.files || []).map(f => f.name);
    setFiles(prev => [...prev, ...names]);
    e.target.value = "";
  }
  function renameFile(i) {
    const next = prompt("ファイル名を編集", files[i]);
    if (next != null && next.trim()) setFiles(files.map((f, idx) => idx === i ? next.trim() : f));
  }
  function submit() {
    if (!title.trim()) { setFlash({ ok: false, msg: "タイトルを入力してください" }); setTimeout(() => setFlash(null), 2000); return; }
    if (start && end && end < start) { setFlash({ ok: false, msg: "終了は開始より後にしてください" }); setTimeout(() => setFlash(null), 2400); return; }
    onAddItem({ kind: recKind, title: title.trim(), A, B, C: Cc, detail1: d1, detail2: d2, start, end, files, notify });
    setFlash({ ok: true, msg: `${recKind === "task" ? "タスク" : recKind === "memo" ? "メモ" : "スケジュール"}として登録しました` });
    setTitle(""); setD1(""); setD2(""); setStart(""); setEnd(""); setFiles([]); setNotify(null);
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

        <button onClick={submit} style={{ ...primaryBtn, marginTop: 4, justifyContent: "center" }}>
          {recKind === "task" ? "タスクとして登録" : recKind === "memo" ? "メモとして登録" : "スケジュールとして登録"} <Send size={15} />
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
function SettingsScreen({ onGotoMaster, onGotoExtCal, onGotoNotify, extCalendars = [], notifySettings, onSignOut, userEmail }) {
  const activeCal = extCalendars.filter(c => c.enabled).length;
  const rows = [
    { icon: Bell, label: "通知", desc: notifySettings?.enabled ? `オン（予定は既定${notifyLabel(notifySettings.defaultLead)}）` : "オフ", onClick: onGotoNotify },
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

// ── 画面：連携カレンダー管理 ──
// ダミー実装。本番では登録URL/メールから iCal取得 or Google Calendar API(OAuth) で連携する。
function ExtCalendarScreen({ extCalendars, setExtCalendars, onBack }) {
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const palette = ["#4285F4", "#0B8043", "#F4B400", "#DB4437", "#8E24AA", "#00897B"];

  const toggle = (id) => setExtCalendars(cals => cals.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  const remove = (id) => setExtCalendars(cals => cals.filter(c => c.id !== id));
  function add() {
    const v = newUrl.trim();
    if (!v) return;
    const isUrl = v.startsWith("http");
    const cal = {
      id: "cal-" + Date.now(),
      name: isUrl ? "新しいカレンダー（iCal）" : v.split("@")[0] + " のカレンダー",
      color: palette[extCalendars.length % palette.length],
      source: v, enabled: true, events: [],
    };
    setExtCalendars(cals => [...cals, cal]);
    setNewUrl(""); setAdding(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 8px" }}>
        <button onClick={onBack} style={{ ...iconBtn, width: 32, height: 32 }}><ArrowLeft size={15} color={C.dim} /></button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: C.paper, fontWeight: 700 }}>連携カレンダー</h1>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>Googleカレンダー等を連携して予定を表示</div>
        </div>
      </div>

      {/* 登録済みカレンダー */}
      <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
        {extCalendars.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: C.dimmer, fontSize: 13 }}>連携中のカレンダーはありません。</div>
        )}
        {extCalendars.map((c, i) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 15px",
            borderBottom: i < extCalendars.length - 1 ? `1px solid ${C.inkSofter}` : "none" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: C.paper, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: C.dimmer, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.source}・{c.events.length}件</div>
            </div>
            {/* 表示ON/OFFトグル */}
            <button onClick={() => toggle(c.id)} style={{
              width: 40, height: 23, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, position: "relative",
              background: c.enabled ? C.gold : C.inkSofter, transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 2, left: c.enabled ? 19 : 2, width: 19, height: 19, borderRadius: "50%",
                background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
            </button>
            <button onClick={() => remove(c.id)} style={miniBtn}><Trash2 size={14} color={C.dawn} /></button>
          </div>
        ))}
      </div>

      {/* 追加 */}
      {adding ? (
        <div style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 16, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>iCal URL、またはGoogleアカウントのメールアドレスを入力</div>
          <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…/basic.ics または you@gmail.com"
            style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setAdding(false); setNewUrl(""); }} style={ghostBtnFull}>キャンセル</button>
            <button onClick={add} style={{ ...primaryBtn, marginTop: 0, flex: 1, justifyContent: "center" }}>連携する</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px",
          borderRadius: 12, border: `1px dashed ${C.line}`, background: "transparent", color: C.gold, fontSize: 13.5, cursor: "pointer", marginBottom: 14 }}>
          <Plus size={15} /> カレンダーを連携
        </button>
      )}

      <div style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.7, padding: "0 4px" }}>
        ※ プレビューでは連携をダミー表示しています。実際の連携（Google Calendar / iCal の取得、Google Meet URLの発行）は、本番環境でのOAuth認証・API接続が必要です。
      </div>
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
  function addLabel() {
    const id = axis.toLowerCase() + Date.now();
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis],
      items: [...prev[axis].items, { id, label: "新しいラベル", color: "#9AA0AD", deco: { bg: false, bold: false, accent: false } }] } }));
  }
  function remove(id) {
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis], items: prev[axis].items.filter(it => it.id !== id) } }));
  }
  function setName(name) {
    setMasters(prev => ({ ...prev, [axis]: { ...prev[axis], name } }));
  }

  const [pickerFor, setPickerFor] = useState(null); // 色選択を開いているラベルid

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 8px" }}>
        {onBack && <button onClick={onBack} style={{ ...iconBtn, width: 32, height: 32 }}><ArrowLeft size={15} color={C.dim} /></button>}
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: C.paper, fontWeight: 700 }}>マスタ管理</h1>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>分類のラベル・色・一覧装飾を設定</div>
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
        {m.items.map(it => (
          <div key={it.id} style={{ background: C.inkSoft, border: `1px solid ${C.inkSofter}`, borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input value={it.label} onChange={e => update(it.id, { label: e.target.value })}
                style={{ ...inputStyle, flex: 1, fontWeight: 600 }} />
              <button onClick={() => remove(it.id)} style={miniBtn}><Trash2 size={14} color={C.dawn} /></button>
            </div>

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
function CalendarScreen({ items, masters, onOpenItem, onNewOnDate, extCalendars = [] }) {
  const [view, setView] = useState("month"); // month | week
  const [sel, setSel] = useState(new Date(2026, 5, 29));        // 選択日(Date)
  const [cursor, setCursor] = useState(new Date(2026, 5, 1));   // 表示中の月(Date, 月初)

  // フィルタ（一覧と共通のUI・仕様）
  const [kindFilter, setKindFilter] = useState("all"); // all | task | memo | event
  const [showSheet, setShowSheet] = useState(false);
  const [fA, setFA] = useState(""); const [fB, setFB] = useState(""); const [fC, setFC] = useState("");
  const [hideDone, setHideDone] = useState(false); // 完了を隠す
  const [colorMode, setColorMode] = useState("class"); // class（②分類、既定）| kind（①区分）
  // 連携カレンダーごとの表示ON/OFF（既定は各カレンダーのenabledに従う）
  const [calVisible, setCalVisible] = useState(() => Object.fromEntries(extCalendars.map(c => [c.id, c.enabled])));

  const activeFilters = (fA ? 1 : 0) + (fB ? 1 : 0) + (fC ? 1 : 0) + (hideDone ? 1 : 0) + (colorMode !== "class" ? 1 : 0);

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
          onClose: () => setShowSheet(false), onReset: () => { setFA(""); setFB(""); setFC(""); setHideDone(false); setColorMode("class"); },
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
  const MAX = 3;          // 1セルに出す行数の目安
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
                      minWidth: 0, minHeight: 72, borderRadius: 8, padding: 3, cursor: "pointer",
                      background: isSel ? C.gold + "14" : "transparent",
                      border: `1px solid ${isSel ? C.gold + "55" : "transparent"}`,
                    }}>
                      <div style={{ textAlign: "center", fontSize: 11.5, marginBottom: 2,
                        color: isSel ? C.goldSoft : C.paper, fontWeight: isSel ? 700 : 400 }}>{dt.getDate()}</div>
                      {/* またがりバーのぶん空ける */}
                      <div style={{ height: barLayerH }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        {singles.slice(0, MAX).map(ev => {
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
                        {singles.length > MAX && (
                          <div style={{ fontSize: 9, color: C.dim, paddingLeft: 4 }}>他{singles.length - MAX}件</div>
                        )}
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
  const START_H = 7, END_H = 22;  // 表示する時間帯 7:00-22:00
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
          {days.map((dt, i) => (
            <div key={i} style={{ position: "relative", height: gridH, borderLeft: `1px solid ${C.line}` }}>
              {/* 時間の横罫線 */}
              {hours.map((h, idx) => (
                <div key={h} style={{ position: "absolute", top: idx * HOUR_H, left: 0, right: 0, borderTop: `1px solid ${C.line}` }} />
              ))}
              {/* 予定矩形 */}
              {onDay(dt).filter(ev => !isAllDay(ev) && !isMultiDay(ev)).map(ev => {
                const r = rect(ev, dt);
                if (!r) return null;
                const col = colorOf(ev);
                return (
                  <div key={ev.id} onClick={() => onOpenItem(ev.id)} style={{
                    position: "absolute", top: r.top, height: r.height, left: 2, right: 2,
                    background: `${col}26`, borderLeft: `3px solid ${col}`, borderRadius: 5,
                    padding: "2px 4px", overflow: "hidden", cursor: "pointer",
                  }}>
                    <div style={{ fontSize: 9.5, color: col, fontWeight: 600, lineHeight: 1.2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      textDecoration: ev.done ? "line-through" : "none" }}>{ev.title}</div>
                    {r.height > 28 && <div style={{ fontSize: 8.5, color: col, opacity: 0.8 }}>{timeOf(ev, dt)}</div>}
                  </div>
                );
              })}
            </div>
          ))}
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

function AutoTextarea({ value, onChange, rows = 3, placeholder, style }) {
  const ref = useRef(null);
  const resize = (el) => {
    if (!el) return;
    if (!el.value) { el.style.height = ""; return; } // 空ならrows既定高さに戻す
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  React.useEffect(() => { resize(ref.current); }, [value]);
  return (
    <textarea
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
  const cur = options.find(o => o.id === value);
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
      {options.map(o => <option key={o.id} value={o.id} style={{ background: C.inkSoft, color: C.paper, fontWeight: 400 }}>{o.label}</option>)}
    </select>
  );
}

// ── 詳細パネル：その場で編集・保存・削除 ──
function DetailPanel({ item, masters, onClose, onSave, onDelete, onToggle, wide }) {
  // item が変わるたびにローカル編集状態を初期化
  const [draft, setDraft] = useState(item);
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

          <button onClick={() => onDelete(draft.id)} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", width: "100%", marginTop: 12,
            borderRadius: 10, border: `1px solid ${C.dawn}44`, background: "transparent", color: C.dawn, fontSize: 13, cursor: "pointer" }}>
            <Trash2 size={14} /> この{draft.kind === "task" ? "タスク" : draft.kind === "memo" ? "メモ" : "スケジュール"}を削除
          </button>
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
  // 連携カレンダー：実連携はフェーズ3。ダミーは撤去し空から開始
  const [extCalendars, setExtCalendars] = useState([]);
  const [screen, setScreen] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [notifyOpen, setNotifyOpen] = useState(false); // 通知センターの開閉
  const NOW = "2026-06-29T09:00"; // デモの現在時刻（本番は実時刻）
  const notifications = buildNotifications(items, notifySettings, NOW);
  const unreadCount = notifications.filter(n => n.past).length; // 発火済み＝未読相当（デモ）
  const [captureStart, setCaptureStart] = useState(""); // カレンダーから日付指定で入力する際の初期開始日時
  const [wide, setWide] = useState(false);

  // 画面幅で右パネル / 下シートを出し分け（880px以上で右パネル）
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 880px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange); };
  }, []);

  // ハンドラは useItems（Supabase同期）に委譲。UI都合の setSelectedId はここで付与。
  const toggle = _itemsApi.toggle;
  const addItem = _itemsApi.addItem;
  const addItems = _itemsApi.addItems;
  const updateByAI = _itemsApi.updateItem;   // AIチャットからの更新
  const deleteByAI = _itemsApi.deleteItems;  // AIチャットからの削除（複数id）
  const saveItem = (draft) => { _itemsApi.saveItem(draft); setSelectedId(null); };
  const deleteItem = (id) => { _itemsApi.deleteItem(id); setSelectedId(null); };

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
                const active = screen === n.id || (n.id === "settings" && (screen === "master" || screen === "extcal" || screen === "notify"));
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
              <CalendarScreen items={items} masters={masters} onOpenItem={setSelectedId} extCalendars={extCalendars}
                onNewOnDate={(isoDate) => { setCaptureStart(isoDate); setScreen("capture"); }} />
            ) : (
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", margin: "-10px -18px -16px", padding: "10px 18px 16px" }}>
                  <div style={{ maxWidth: wide ? 980 : "none", margin: "0 auto", width: "100%" }}>
                  {screen === "home" && <HomeScreen items={items} masters={masters} onOpen={setSelectedId} onGoto={setScreen} wide={wide} />}
                  {screen === "list" && <ListScreen items={items} masters={masters} onToggle={toggle} onOpen={setSelectedId} selectedId={selectedId} wide={wide} />}
                  {screen === "capture" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><CaptureScreen masters={masters} onAddItem={addItem} initialStart={captureStart} onConsumeInitial={() => setCaptureStart("")} /></div>}
                  {screen === "settings" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><SettingsScreen onGotoMaster={() => setScreen("master")} onGotoExtCal={() => setScreen("extcal")} onGotoNotify={() => setScreen("notify")} extCalendars={extCalendars} notifySettings={notifySettings} onSignOut={onSignOut} userEmail={userEmail} /></div>}
                  {screen === "master" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><MasterScreen masters={masters} setMasters={setMasters} onBack={() => setScreen("settings")} /></div>}
                  {screen === "extcal" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><ExtCalendarScreen extCalendars={extCalendars} setExtCalendars={setExtCalendars} onBack={() => setScreen("settings")} /></div>}
                  {screen === "notify" && <div style={{ maxWidth: wide ? 640 : "none", margin: "0 auto" }}><NotifySettingsScreen settings={notifySettings} setSettings={setNotifySettings} onBack={() => setScreen("settings")} /></div>}
                  </div>
                </div>
              )}
          </main>

          {!wide && (
          <nav style={{ flexShrink: 0, display: "flex", padding: "8px 8px 20px", borderTop: `1px solid ${C.inkSofter}`,
            background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}>
            {nav.map(n => {
              const active = screen === n.id || (n.id === "settings" && (screen === "master" || screen === "extcal" || screen === "notify")); const Icon = n.icon; const isCapture = n.id === "capture";
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
          <DetailPanel item={selected} masters={masters} wide
            onClose={() => setSelectedId(null)} onSave={saveItem} onDelete={deleteItem} onToggle={toggle} />
        )}
      </div>

      {/* 狭い画面用の下シート（全幅オーバーレイ） */}
      {selected && !wide && (
        <DetailPanel item={selected} masters={masters} wide={false}
          onClose={() => setSelectedId(null)} onSave={saveItem} onDelete={deleteItem} onToggle={toggle} />
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
