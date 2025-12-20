# Twitch API Migration Audit & Contract

## Scope
*   **Goal**: Migrate `js/twitch-api.js` to a TypeScript feature module `src/features/twitch`.
*   **Target**: `window.twitchApi` implementation.
*   **Non-Goals**: UI modification, changing API behavior, or removing legacy fallbacks (unless strictly unused).

## Current Public APIs
The legacy `window.twitchApi` exposes the following:

| Function | Signature | Description |
| :--- | :--- | :--- |
| `searchChannels` | `(query: string, limit?: number) => Promise<ChannelSearchResult[]>` | Searches Twitch channels. Returns `[]` on empty query. |
| `checkChannelLiveStatus` | `(login: string) => Promise<LiveStatusResult>` | Checks single channel status. Returns object with `isLive: null` on error. |
| `checkMultipleChannelsLiveStatus` | `(logins: string[]) => Promise<Record<string, LiveStatusResult>>` | Batches requests (100 size). Returns map of results. |
| `setConfig` | `(config: Partial<Config>) => void` | Updates config and persists to LocalStorage. |
| `getConfig` | `() => ParsedConfig` | Returns current config (hiding secrets if possible). |
| `clearCache` | `() => void` | Clears in-memory API response cache. |

## Auth Flow Contract
**Priority Order**:
1.  **Memory Cache**: Valid, non-expired token.
2.  **LocalStorage**: `twitchAccessToken` + `twitchAccessTokenExpiresAt` (checked for expiration).
3.  **Pages Function** (`/api/twitch-token`): Primary method for production/deployed environments.
4.  **Direct OAuth** (`id.twitch.tv`): Fallback if Client Secret is available locally.

**Token Refresh**:
*   On 401 response: Clear cache/storage -> Request new token -> Retry original request once.
*   Cooldown/Buffer: Tokens are cached with a 5-minute safety buffer before expiration.

## Config Resolution Contract
**Resolution Order** (First found wins):
1.  **Environment Variables**: `import.meta.env` or `window.__ENV__` (e.g., `VITE_TWITCH_CLIENT_ID`).
2.  **Global Config**: `window.CONFIG` (legacy `config.js`).
3.  **LocalStorage**: `twitchClientId`, `twitchClientSecret` etc.
4.  **Pages API** (Lazy): `getClientIdFromPagesFunction` (`/api/twitch-config`) if ID is missing.

**Key Names**:
*   ClientId: `VITE_TWITCH_CLIENT_ID` / `TWITCH_CLIENT_ID` / `twitchClientId`
*   Secret: `TWITCH_CLIENT_SECRET` / `twitchClientSecret`
*   Token: `TWITCH_ACCESS_TOKEN` / `twitchAccessToken`
*   Proxy: `TWITCH_PROXY_URL` / `twitchProxyUrl`

## Storage Contract
All keys are prefixed or specific. All storage operations must be tolerant (try-catch).

| Key | Format | Description |
| :--- | :--- | :--- |
| `twitchClientId` | String | Client ID override |
| `twitchClientSecret` | String | Client Secret override |
| `twitchAccessToken` | String | Current App Access Token |
| `twitchAccessTokenExpiresAt` | String (Timestamp) | Expiration time (ms) |
| `twitchProxyUrl` | String | Proxy usage URL |
| `twitchUseProxy` | String ("true"/"false") | Boolean toggle |

## Rate Limit Contract
*   **Limit**: 30 requests per minute (Fixed window).
*   **Behavior**:
    *   Client-side tracking via `requests` array.
    *   If limit exceeded, throw Error immediately.
*   **Side Effect (Critical)**:
    *   When limit implies > 0s wait, calling `showTwitchRateLimitNotification(waitSeconds)`.
    *   **Contract**: The new implementation must support a `RateLimitNotifier` interface. The default implementation must imply the **exact same DOM manipulation** (create `#twitch-rate-limit-notification` overlay) to preserve UX.

## Caching Contract
*   **Strategy**: In-memory Map (`apiCache`).
*   **Key**: `endpoint + JSON(params)`.
*   **Duration**: 60 seconds (default).
*   **Behavior**:
    *   `clearCache()` wipes the map.
    *   Mutating config (client secret/id) clears the token cache.

## Error & Retry Contract
*   **401 (Unauthorized)**:
    *   First attempt: Refresh token -> Retry.
    *   Second attempt: Throw specific Auth Error.
*   **429 (Too Many Requests)**: Throw immediately (handled by Rate Limit logic usually, but API might return it too).
*   **General Fetch Errors**:
    *   Network error: "無法連接到 Twitch API..."
    *   Other HTTP errors: Status code + Text.
*   **Live Status Swallow**: `checkChannelLiveStatus` swallows errors and returns `isLive: null` (Unknown) to prevent UI breakage.

## Cutover Readiness Checklist
*   [ ] `src/bootstrap/initLegacyGlobals.ts` is ready to accept `twitchApi` injection.
*   [ ] `TwitchService` implements `TwitchApiContract`.
*   [ ] No other file writes to `window.twitchApi`.
*   [ ] Ensure `main.js` and `settings.js` call `window.twitchApi.*` dynamically (already confirmed).

## Verification Plan
`verify_twitch_api.ts` (Node.js) will verify:
1.  **Config**: Loads correctly from mocked LocalStorage/Env.
2.  **Auth**:
    *   Uses cached token if valid.
    *   Refreshes via mock Pages Function if expired.
    *   Falls back to Direct OAuth if Pages fails.
3.  **Client**:
    *   Appends Client-ID and Authorization headers.
    *   Retries exactly once on 401.
    *   Respects Rate Limit (throws after 30 reqs).
4.  **Notifiers**: Verify `notify()` is called on rate limit (mocking DOM adapter).
5.  **Service**:
    *   `searchChannels` returns mapped objects.
    *   `checkChannelLiveStatus` handles empty/error gracefully.
