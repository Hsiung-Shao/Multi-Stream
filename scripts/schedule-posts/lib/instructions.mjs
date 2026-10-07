// 讀圖由 Claude Desktop 排程任務本身完成（使用者 2026-10-05 裁定：不接 Anthropic API，指定模型跑排程）。
// collect 階段把候選貼文與圖片放到 work/，並產生 work/INSTRUCTIONS.md 告訴那個 Claude 怎麼看圖、輸出什麼形狀；
// apply 階段讀回 work/results.json。這裡定義輸出形狀（與 rules.mjs 的檢查對應）與提示文字。

import { taipeiDate } from './rules.mjs';

/** results.json：{ "<postId>": ParsedSchedule }；ParsedSchedule 形狀如下（JSON Schema 給人看，也給 apply 做基本檢查） */
export const RESULT_SCHEMA = {
  type: 'object',
  required: ['is_schedule', 'week_start', 'confidence', 'entries'],
  properties: {
    is_schedule: { type: 'boolean', description: '這張圖是直播週表／行程表（列出多天的開台時間）' },
    week_start: { type: ['string', 'null'], description: '週表涵蓋的第一天 YYYY-MM-DD；圖上沒寫日期就依發文日期推算；不確定給 null' },
    confidence: { type: 'number', description: '整張表讀取的信心 0～1' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['date', 'time', 'title', 'platform', 'is_rest', 'confidence'],
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD（台北日期）' },
          time: { type: ['string', 'null'], description: 'HH:MM 24 小時制台北時間；休息日或沒寫時間給 null' },
          title: { type: 'string', description: '當天內容（遊戲名、企劃名）；休息日給空字串' },
          platform: { type: 'string', enum: ['youtube', 'twitch', 'unknown'], description: '依圖示判斷平台；看不出來給 unknown' },
          is_rest: { type: 'boolean', description: '休息日／不開台' },
          confidence: { type: 'number', description: '這一列的信心 0～1' },
        },
      },
    },
  },
};

export const READING_RULES = [
  '- 時間一律換成台北時間（UTC+8）24 小時制。圖上若同時寫台灣與日本時間（例如「20:00(JP21:00)」），取台灣的 20:00；只標 JST／JP 的時間要減 1 小時。',
  '- 圖上只有星期沒有日期時，以發文日期所在的那一週推算日期（週表通常從發文日當週的週一開始；若標題寫了日期範圍以範圍為準）。',
  '- 休息日、お休み、休息、REST 之類標 is_rest=true、time=null。',
  '- 平台依圖示判斷：YouTube 播放鍵／紅色圖示＝youtube，Twitch 紫色圖示＝twitch；沒有圖示給 unknown。',
  '- 「未定」「TBA」「時間另行公告」沒有確定時間 → time=null、confidence 低。',
  '- 不是週表（例如單場直播預告、周邊、會員桌布、公告）→ is_schedule=false、entries 空陣列。',
  '- 貼文文字若已寫出日期時間，與圖對照；兩者衝突以圖為準但 confidence 降低。',
];

/** 一篇候選貼文在 INSTRUCTIONS.md 裡的段落 */
export function candidateSection(c) {
  const postDay = taipeiDate(c.postDate);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(c.postDate + 8 * 3600e3).getUTCDay()];
  return [
    `### ${c.postId}`,
    `- VTuber：${c.name}（YouTube ${c.externalId}）`,
    `- 發文日期（推算，台北）：${postDay}（星期${weekday}）`,
    `- 圖片：${c.localImage}（原網址 ${c.imageUrl}）`,
    `- 貼文文字：${(c.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 600) || '（無）'}`,
  ].join('\n');
}

/** 整份 INSTRUCTIONS.md */
export function buildInstructions(candidates, { now, resultsPath }) {
  return [
    '# 社群週表圖解析：請讀下列每張圖，輸出 results.json',
    '',
    `今天（台北）：${taipeiDate(now)}。這些是台灣 VTuber 貼在 YouTube 社群的圖片，請判斷每張是不是直播週表，並把每一天的開台資訊讀出來。`,
    '',
    '## 讀圖規則',
    ...READING_RULES,
    '',
    '## 輸出',
    `把結果寫到 \`${resultsPath}\`，格式：\`{ "<postId>": <ParsedSchedule>, … }\`，每個候選貼文都要有一個 key（不是週表也要給 is_schedule=false）。ParsedSchedule 的 JSON Schema：`,
    '```json',
    JSON.stringify(RESULT_SCHEMA, null, 2),
    '```',
    '',
    `## 候選貼文（${candidates.length} 篇）`,
    '',
    ...candidates.map(candidateSection),
    '',
  ].join('\n');
}
