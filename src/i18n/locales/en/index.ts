// Lazy-load barrel：此語言所有 namespace 打包成單一動態 chunk，由 src/i18n/i18n.ts 依當前語言載入（不進首屏 entry）。
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
import support from './support';
import compare from './compare';
import schedule from './schedule';
import status from './status';
import songs from './songs';

export default {
  common, navbar, controlPanel, welcome, about, tutorial, versionHistory,
  favorites, feedback, privacy, tags, youtubeRisk, stream, faq, announcements, seo, support, compare, schedule, status, songs,
};
