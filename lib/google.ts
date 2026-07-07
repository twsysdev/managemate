// Google OAuth 2.0 ＋ Calendar API（サーバー専用）。
// 追加依存は使わず fetch で実装。API Route からのみ呼ぶこと。

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// 予定の読み取り＋メール取得のスコープ
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function creds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google の環境変数が未設定です。GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を設定してください（docs/PHASE3_GOOGLE_CALENDAR.md 参照）。"
    );
  }
  return { clientId, clientSecret };
}

// 認可URL（access_type=offline + prompt=consent で refresh_token を確実に得る）
export function buildAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = creds();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
  token_type?: string;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("token exchange failed: " + (await res.text()));
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("token refresh failed: " + (await res.text()));
  return res.json();
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // ベストエフォート
  }
}

// id_token（JWT）からメールを取り出す
export function emailFromIdToken(idToken?: string): string {
  if (!idToken) return "";
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64").toString("utf8")
    );
    return payload.email || "";
  } catch {
    return "";
  }
}

interface GCalListEntry {
  id: string;
  summary?: string;
  backgroundColor?: string;
  selected?: boolean;
  primary?: boolean;
}

export async function fetchCalendarList(accessToken: string): Promise<GCalListEntry[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("calendarList failed: " + (await res.text()));
  const j = await res.json();
  return j.items || [];
}

interface GCalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
}

export async function fetchEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<{ items: GCalEvent[]; timeZone: string }> {
  const p = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeMin,
    timeMax,
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events?${p.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return { items: [], timeZone: "" };
  const j = await res.json();
  // j.timeZone はカレンダーの既定タイムゾーン（例: "Asia/Tokyo"）
  return { items: j.items || [], timeZone: j.timeZone || "" };
}

// カレンダーの timeZone が取れないときのフォールバック（本アプリは日本時間基準）
const DEFAULT_TZ = "Asia/Tokyo";

// RFC3339（"...Z"＝UTC / "...+09:00"＝オフセット付き 等）を、
// 指定タイムゾーンの「壁時計」YYYY-MM-DDTHH:MM に変換する。
// ・文字列の先頭16文字を切るだけだと、GoogleがUTC(Z)で返す予定で時刻がずれるため、
//   一度 Date（絶対時刻）にしてから対象TZの現地時刻へ変換する。
function toWallClock(iso: string, tz: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso.slice(0, 16); // 念のためのフォールバック
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  let hh = get("hour");
  if (hh === "24") hh = "00"; // 一部環境で 24:00 表記になるのを 00:00 に補正
  return `${get("year")}-${get("month")}-${get("day")}T${hh}:${get("minute")}`;
}

// Google の日時 → アプリ形式（時刻あり "YYYY-MM-DDTHH:MM" / 終日 "YYYY-MM-DD"）
// 時刻ありは絶対時刻としてパースし、カレンダーのタイムゾーンの壁時計に変換（UTC/オフセット両対応）。
function fmtGoogleDate(d: { dateTime?: string; date?: string } | undefined, tz: string): string {
  if (!d) return "";
  if (d.dateTime) return toWallClock(d.dateTime, tz);
  return d.date || ""; // 終日は日付のみ（タイムゾーン変換しない）
}

export interface AppExtCalendar {
  id: string;
  name: string;
  color: string;
  source: string;
  enabled: boolean;
  events: { id: string; title: string; start: string; end: string; meet: string }[];
}

// 連携済みユーザーのカレンダー＋予定を、アプリの extCalendars 形状で返す
export async function loadGoogleCalendars(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<AppExtCalendar[]> {
  const list = (await fetchCalendarList(accessToken)).slice(0, 12);
  const results = await Promise.all(
    list.map(async (c) => {
      const { items, timeZone } = await fetchEvents(accessToken, c.id, timeMin, timeMax);
      return {
        id: c.id,
        name: c.summary || (c.primary ? "メイン" : "カレンダー"),
        color: c.backgroundColor || "#4285F4",
        source: "Google",
        enabled: c.selected !== false,
        events: items.map((ev) => ({
          id: ev.id,
          title: ev.summary || "(タイトルなし)",
          start: fmtGoogleDate(ev.start, timeZone),
          end: fmtGoogleDate(ev.end, timeZone),
          meet: ev.hangoutLink || "",
        })),
      };
    })
  );
  return results;
}
