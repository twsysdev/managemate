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
): Promise<GCalEvent[]> {
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
  if (!res.ok) return [];
  const j = await res.json();
  return j.items || [];
}

// Google の日時 → アプリ形式（"YYYY-MM-DDTHH:MM" or 終日 "YYYY-MM-DD"）
// dateTime は先頭16文字が現地の壁時計時刻なのでそのまま採用（タイムゾーンずれ回避）
function fmtGoogleDate(d?: { dateTime?: string; date?: string }): string {
  if (!d) return "";
  if (d.dateTime) return d.dateTime.slice(0, 16);
  return d.date || "";
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
      const events = await fetchEvents(accessToken, c.id, timeMin, timeMax);
      return {
        id: c.id,
        name: c.summary || (c.primary ? "メイン" : "カレンダー"),
        color: c.backgroundColor || "#4285F4",
        source: "Google",
        enabled: c.selected !== false,
        events: events.map((ev) => ({
          id: ev.id,
          title: ev.summary || "(タイトルなし)",
          start: fmtGoogleDate(ev.start),
          end: fmtGoogleDate(ev.end),
          meet: ev.hangoutLink || "",
        })),
      };
    })
  );
  return results;
}
