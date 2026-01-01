import { onRequestGet as __api_ga_config_js_onRequestGet } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\ga-config.js"
import { onRequestOptions as __api_ga_config_js_onRequestOptions } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\ga-config.js"
import { onRequestGet as __api_twitch_config_js_onRequestGet } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\twitch-config.js"
import { onRequestOptions as __api_twitch_config_js_onRequestOptions } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\twitch-config.js"
import { onRequestGet as __api_twitch_token_js_onRequestGet } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\twitch-token.js"
import { onRequestOptions as __api_twitch_token_js_onRequestOptions } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\twitch-token.js"
import { onRequestPost as __api_twitch_token_js_onRequestPost } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\twitch-token.js"
import { onRequestGet as __api_youtube_channel_live_js_onRequestGet } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\youtube-channel-live.js"
import { onRequestOptions as __api_youtube_channel_live_js_onRequestOptions } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\youtube-channel-live.js"
import { onRequestGet as __api_youtube_channel_live_og_js_onRequestGet } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\youtube-channel-live-og.js"
import { onRequestGet as __api_youtube_channel_page_js_onRequestGet } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\youtube-channel-page.js"
import { onRequestOptions as __api_youtube_channel_page_js_onRequestOptions } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\youtube-channel-page.js"
import { onRequestGet as __api_youtube_config_js_onRequestGet } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\youtube-config.js"
import { onRequestOptions as __api_youtube_config_js_onRequestOptions } from "D:\\codeproject\\web\\multi-stream\\functions\\api\\youtube-config.js"

export const routes = [
    {
      routePath: "/api/ga-config",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_ga_config_js_onRequestGet],
    },
  {
      routePath: "/api/ga-config",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_ga_config_js_onRequestOptions],
    },
  {
      routePath: "/api/twitch-config",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_twitch_config_js_onRequestGet],
    },
  {
      routePath: "/api/twitch-config",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_twitch_config_js_onRequestOptions],
    },
  {
      routePath: "/api/twitch-token",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_twitch_token_js_onRequestGet],
    },
  {
      routePath: "/api/twitch-token",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_twitch_token_js_onRequestOptions],
    },
  {
      routePath: "/api/twitch-token",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_twitch_token_js_onRequestPost],
    },
  {
      routePath: "/api/youtube-channel-live",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_youtube_channel_live_js_onRequestGet],
    },
  {
      routePath: "/api/youtube-channel-live",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_youtube_channel_live_js_onRequestOptions],
    },
  {
      routePath: "/api/youtube-channel-live-og",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_youtube_channel_live_og_js_onRequestGet],
    },
  {
      routePath: "/api/youtube-channel-page",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_youtube_channel_page_js_onRequestGet],
    },
  {
      routePath: "/api/youtube-channel-page",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_youtube_channel_page_js_onRequestOptions],
    },
  {
      routePath: "/api/youtube-config",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_youtube_config_js_onRequestGet],
    },
  {
      routePath: "/api/youtube-config",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_youtube_config_js_onRequestOptions],
    },
  ]