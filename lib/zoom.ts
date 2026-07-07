// Zoom OAuth 2.0 ＋ Meeting API（サーバー専用）。
// 追加依存は使わず fetch で実装。API Route からのみ呼ぶこと。
// ※ Google 連携（lib/google.ts）と同じ構成。トークンはフロントに出さない。

const AUTH_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const API_BASE = "https://api.zoom.us/v2";
const APP_TZ = "Asia/Tokyo";

function creds() {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Zoom の環境変数が未設定です。ZOOM_CLIENT_ID と ZOOM_CLIENT_SECRET を設定してください。"
    );
  }
  return { clientId, clientSecret };
}

// トークンエンドポイント用の Basic 認証ヘッダ（client_id:client_secret を base64）
function basicAuth(): string {
  const { clientId, clientSecret } = creds();
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

// 認可URL。Zoom は scope をアプリ設定側で管理するため、ここでは指定不要。
export function buildAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = creds();
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string; // Zoom はリフレッシュ時にローテーションする（毎回保存し直すこと）
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error("zoom token exchange failed: " + (await res.text()));
  return res.json();
}

// リフレッシュ。Zoom は新しい refresh_token を返す（＝ローテーション）ので呼び出し側で必ず保存する。
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error("zoom token refresh failed: " + (await res.text()));
  return res.json();
}

// 連携アカウントのメール等を取得（user:read:user）。
export async function getMe(accessToken: string): Promise<{ email: string }> {
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { email: "" };
  const j = await res.json();
  return { email: j.email || "" };
}

export interface CreatedMeeting {
  id: string;
  join_url: string;
  passcode: string;
  start_time: string;
}

// アプリの日時文字列（"YYYY-MM-DDTHH:MM" or "YYYY-MM-DD"）を Zoom 用に整える。
// 時刻ありは "YYYY-MM-DDTHH:MM:SS"（タイムゾーンは Asia/Tokyo をbody側で指定）。
// 終日/時刻なしは当日 09:00 を既定にする。
function toZoomStart(start: string): string {
  if (!start) {
    // 未指定は「今から」に近い当日日付。Zoom は type:2 で start_time 必須ではないが、安定のため補完。
    const now = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    return `${now}T09:00:00`;
  }
  if (start.includes("T")) {
    const s = start.length === 16 ? `${start}:00` : start; // 分までなら秒を足す
    return s;
  }
  return `${start}T09:00:00`;
}

// 予定の開始/終了から所要分を算出（既定60分・最小15分）。
function durationMinutes(start: string, end: string): number {
  if (start && end && start.includes("T") && end.includes("T")) {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms > 0) return Math.max(15, Math.round(ms / 60000));
  }
  return 60;
}

// 会議を作成。type:2＝日時指定のスケジュール会議。待機室ON・参加時ミュートを既定にする。
export async function createMeeting(
  accessToken: string,
  input: { topic: string; start: string; end: string }
): Promise<CreatedMeeting> {
  const body = {
    topic: (input.topic || "会議").slice(0, 200),
    type: 2,
    start_time: toZoomStart(input.start),
    timezone: APP_TZ,
    duration: durationMinutes(input.start, input.end),
    settings: {
      join_before_host: false,
      waiting_room: true,
      mute_upon_entry: true,
      auto_recording: "none",
    },
  };
  const res = await fetch(`${API_BASE}/users/me/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("zoom create meeting failed: " + (await res.text()));
  const j = await res.json();
  return {
    id: String(j.id ?? ""),
    join_url: j.join_url || "",
    passcode: j.password || j.passcode || "",
    start_time: j.start_time || body.start_time,
  };
}

// 会議を削除（紐づけ解除時に使用）。存在しない/失敗はベストエフォート。
export async function deleteMeeting(accessToken: string, meetingId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/meetings/${encodeURIComponent(meetingId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // ベストエフォート
  }
}
