// Lazy-load barrel：將此語言的所有 namespace 打包成單一動態 chunk，
// 由 src/i18n/i18n.ts 在切換到此語言時才載入（縮小首屏 entry 體積）。
import common from './common';
import navbar from './navbar';
import controlPanel from './controlPanel';
import welcome from './welcome';
import about from './about';
import tutorial from './tutorial';
import versionHistory from './versionHistory';
import favorites from './favorites';
import feedback from './feedback';
import privacy from './privacy';
import tags from './tags';
import youtubeRisk from './youtubeRisk';
import stream from './stream';
import faq from './faq';
import announcements from './announcements';
import seo from './seo';

export default {
  common, navbar, controlPanel, welcome, about, tutorial, versionHistory,
  favorites, feedback, privacy, tags, youtubeRisk, stream, faq, announcements, seo,
};
