# 台灣團體標籤：待確認事項（2026-09-29 查證）

這些項目只有單一第三方來源、互相矛盾，或查不到頻道 ID，所以**沒有**寫進資料 migration。確認後改 `tw-groups-2026-09.json`（或 `build-group-migration.mjs` 的 `STATUS_FIXES`）再重新產生。

## 成員狀態
| 團體 | 成員 | 查到的狀況 | 為什麼沒改 |
|---|---|---|---|
| Limnos | 黑銀夜烏、奇露琪露、艾提、光逸 幸、火野貝 | 2026-10 陸續畢業，10-31 團體解散 | 還沒到畢業日；10 月底後改 graduate |
| TSA Studio | 火吻怪盜卡門 | 2026-09-12 畢業 | 只有 VTpedia 單一來源 |
| 哇啦咚咚工作室 | 涅菈、星璃 | 09-28、09-30 畢業 | 只有 VTpedia 單一來源 |
| L.M. Live | 璦格蓓菈、海希霖涅 | 來源 preparing，已出道 | 第三方（USADA） |
| 弓炬計畫 | 梅婕 | 2024-10 已改無所屬 | 第三方（TaiwanVTuberData 記錄） |
| 弓炬計畫 | 貞德賈德 | 來源 graduate，lit.link 仍列正式藝人 | 兩邊矛盾 |
| Mojoy Live | 朔璃 | 官網沒列，可能離開 | 沒有公告 |
| 點一璃Glaçage | 夏木日葵 | 來源 graduate，2025-07 官方仍稱旗下藝人 | 沒找到畢業公告 |
| 塩月家 | 苒茉莉莉、夏露蒂Chalortti | 官網沒列 | 沒找到公告 |
| 夢想之都工作室 | 煦 | 官網沒列 | 沒找到公告 |
| 霧章 | 音羽奈 Otowana | 頻道名變成「黒川奈々」 | 需人工到頻道確認是否改名或換人 |

## 新成員（查不到頻道 ID，資料庫也沒有這些人）
- 子午計畫：沉珀 Aetris 的莓 Ichii、宓 Iseri、璃 Miri（2026-09-18～20 出道）
- ReLive Project：梓凜 Tsulin
- Mojoy Live：姬宮 乃愛（練習生）
- 春魚創意 Para≠dox：蕾忒、佐霏、瑟思安（拉斐利婭 @Laphria.Paradox、安特羅迦已在資料庫）
- 恋Vaichu：ORI 央莉 @ORI-maomao（2024-08-16 出道）
- 終焉理想庭：愛紗公主；煥悅工作室：玥喵喵喵；MOMOMO團：帕露菲、小北車車；超異界通信+：心花りりゆ、米秝Mily
- 預見娛樂：懶貓子 @Lanmewko（個人藝人）

## 子團逐人對應
- ~~預見娛樂的子團逐人對應沒查到~~ → 2026-09-29 逐家名冊已對應（7 個分組）。
- ~~春魚創意已結束的團成員掛在 SquareLive~~ → 2026-09-29 逐家名冊已歸到終端少女、瀕臨絕種團RESCUTE、惡獸時代Monstar。

## 來源漏列的企業勢候選（未建立）
李氏集團（鷗麥麥麥）、AkioAIR（偏英語圈）、KIMINA Studio（籌備中）、七貓娛樂（說法矛盾）、紫貓屋（夜露妮亞 2026-09 出道）、WASYVILA（現況不明）。

## 查不到或無法判斷的團體（kind=unverified）
芥川組、KAHO-FAMI、夢月・Dream Moon、星軌工作室、霧章、盆栽工作室、24/7、Digital Dreamer、小精靈Club、弓炬計畫、海線少女、ENDlive、Craftslive Studio、New Area Studio、破曉鴻羽、湮雨計畫、隆中閣、波游，以及其餘 200 多個未查證的小團體。


## 企業勢逐家名冊（2026-09-29）後仍待處理

由 scripts/build-agency-rosters.mjs 的報告整理。名冊來源 scripts/data/tw-agency-rosters-2026-09.json（每位附出處）。

### 查不到頻道，沒有新增（18 位）
- 靛之森/伊索渡（graduated）
- YahooTV/大合虎子（active）
- ReLive Project/鹿遙（graduated）
- Mirolive/榭伊（graduated）
- Yololive/羽魚ぬぬ魚（active）
- Yololive/芙妮（active）
- Yololive/小俞ツ（active）
- Yololive/炎言夏日（active）
- 公共電視文化事業基金會/海月粼粼（graduated）
- 公共電視文化事業基金會/凱文布魯（active）
- 公共電視文化事業基金會/海月波波（active）
- 公共電視文化事業基金會/幽夜南栖（active）
- Mojoy Live/霓霞（graduated）
- Mojoy Live/禮若凌（graduated）
- Mojoy Live/天雪花苑（graduated）
- Mojoy Live/北溟（graduated）
- Mojoy Live/春櫻桃桃（graduated）
- Mojoy Live/AYA彩彩（preparing）

### 頻道對不上（資料庫記的帳號已不存在或已刪，沒有覆蓋）
- 預見娛樂/愛喵Andi：twitch 帳號不存在 enominya_andi
- YahooTV/大合虎子：youtube handle 查無 @TaigaTorako
- ReLive Project/諾櫻：twitch 帳號不存在 noeyinrelive
- ReLive Project/鹿遙：youtube 頻道不存在 UCDMDdgB7yiYQT_Q08mXqSvg
- Mirolive/星之川倷緒：twitch 帳號不存在 hoshinokawanao
- Mirolive/榭伊：youtube 頻道不存在 UCXxUxZEkRdZUZ5o3PcC_eUA
- 花遊工作室/紫藤堇：twitch 帳號不存在 yukari03210
- Yololive/啵妮：twitch 帳號不存在 boniya0w0
- TSA Studio/逆恩：twitch 帳號不存在 neon0414_vtuber
- TSA Studio/銀刻：twitch 帳號不存在 ink1221_vtuber
- TSA Studio/天泣8號：twitch 帳號不存在 tenki_vtuber
- TSA Studio/里莫：twitch 帳號不存在 rimorimo_vtuber
- TSA Studio/常闇やみや：twitch 帳號不存在 yamiya0501_vtuber
- Mojoy Live/春櫻桃桃：youtube handle 查無 @ch.MojoyLive-momo

### 頻道對上但名字不像（沒有更新，需人工確認）
- Mojoy Live/姬宮乃愛：名冊判定的 YouTube 頻道（UCEN6ItN7w-7-MkzAiwWdaqQ），資料庫記的是已畢業的「北溟」。可能是頻道在北溟畢業後轉給新人，也可能是研究誤判。

### 名冊與資料庫記的帳號不同（頻道表沒有補，需人工確認）
- Leor Live/詩瑠：名冊（portaly）的 Twitch 是 shizuru_nesh1（id 1408206084，查得到）；資料庫記 46shizuru，頻道表那列沒有 external_id（從未解析成功）。確認後把資料庫改成新帳號，週表才會追到這個 Twitch 頻道。

### 名冊的人工判斷（見名冊檔 _overrides）
- 轉個人勢（清所屬、記前所屬、維持現役）：周默、小金碧碧、薇恩‧黛娜、月下香幽芳（雲際線）、星見遙（比鄰星域）、柴崎楓音（箱箱The Box）、璐洛洛（蜂沛）
- 狀態未查證，只掛團不改狀態：天泣8號（TSA）、煦（夢想之都）、虎妮（YahooTV，長休非畢業）
- 日期只有非官方出處，標 date-approx 不寫入：星見遙（比鄰星域）
- 恋Vaichu 改為社團（官方自稱社團勢）
- Limnos 其餘 5 人 10 月陸續畢業：火野貝 09-30、黑銀夜烏 10-11、奇露琪露 10-12、艾提 10-13、光逸幸 10-25（目前仍現役，已記預定畢業日）

## 子團名稱與合作藝人（2026-09-30 查證）後仍待處理
來源：`scripts/data/tw-agency-collabs-2026-09.json`；migration `20260930100100_vtuber_collab_links.sql`。

### 合作藝人：沒有加入
- 春魚創意/兔姬：2023-10-19 有官方合作公告，但現在的官方名單已不見這位、也沒有終止公告，狀態不明。
- 春魚創意/祈菈．貝希毛絲、恋Vaichu/弗倫頓：查無官方出處。
- 恋Vaichu/橘 Mika：官方列為合作，但查不到頻道。
- 古德文創/葉月 Hazuki、sazki：官網把所有人都列在「合作藝人」，資料庫記為正式成員。主所屬沒動；要確認古德文創是否其實沒有正式成員。
- 古德文創/漏打、SobadRush、長毛、Zonda：官方合作名單上的真人實況主或賽評，不是 VTuber，已排除（見 `merge-agency-collabs.mjs` 的 OVERRIDES）。
- 春魚創意/Ren：已新增為合作。Twitch 自介寫曾獲塔科夫亞洲冠軍，是否為 VTuber 待確認。

### 子團
- 春魚創意/SquareLive：官方團體清單沒有它、底下也沒有成員，判定為品牌或廠牌名，已刪除（依旁證推論，沒有官方說明）。
- TSA Studio/SUPER：官方寫法有「一期生 Super」，全大寫只出現在資料庫，大小寫待確認。
- 鹿鳴娛樂/創傷劇團：英文名 Trauma Troupe 只出現在帳號縮寫，已改為官方可見的「創傷劇團」。
- L.M. Live/AHYMN：中文團名查不到。
- 比鄰星域：官方 YouTube 有「無序樂章Vsinger」一區，查不到屬於比鄰星域的證據，沒有建立。
- Mirolive：二手資料有一期生、二期生的說法，查不到官方完整名單，沒有建立。
- Limnos/NKshoujo、黑箱劇場：已解散的前身團，2023-11 合併後成員改為 Limnos 直屬；團名保留，成員沒有搬進去。

### 子團成員：資料庫沒有或沒搬
- 花遊工作室/希望旅團：茱莉葉塔、比托利亞（資料庫沒有）。
- 公共電視/宮氏海水浴場：幽夜南栖系、海月波波、凱文布魯（資料庫沒有）。
- Mirolive/MiroLink：榭伊（資料庫沒有，頻道已不存在）。
- Mojoy Live/九相狩：禮若凌（資料庫沒有）。
- 雲際線工作室：薇恩‧黛娜（星滿街）、月下香幽芳和小金碧碧（十三月商團）已轉個人勢（前所屬＝雲際線），沒有搬回子團。

### 只靠名字比對搬進子團的人（2026-09-30 已核對頻道）
- 霓霞、天雪花苑、春櫻桃桃 → Mojoy Live 九相狩／異寵聯邦：頻道分別為「Mojoy Live 練習生」「Mojoy Live」，確認是同一批人。
- 肉肉薔蒔 → Mirolive MiroLink：頻道「Qmo Ch. 肉肉薔蒔」，確認是本人。
- 北溟 → Mojoy Live 九相狩（已畢業）：資料庫記的頻道現在叫「姬宮 乃愛」，見上方「頻道對上但名字不像」。
- 正式站套用前：這 5 人的 id 要在正式站存在，且名字、頻道一致（migration 以 id 定位）。

### 研究順帶發現的狀態問題（未處理）
- 預見娛樂：利卡洛斯、愛喵Andi 官網標已畢業；梅奧奧已解約。
- 鹿鳴娛樂：安戈洛已永久結束活動。
- 花遊工作室：納希斯已完結；海晞、朔礼 2022 年畢業。
- Mojoy Live：朔璃標「脫退」；冬伏凜等 6 位一期生已不在官網名單，沒有公告。
- 雲際線工作室：李李鈴蘭、瑪格麗特．溫特斯、神稻櫻火 2022-07 畢業後轉生到箱箱The Box，資料庫仍掛在雲際線公司層。
- 公視：小媒 2023-07 已辦畢業。
- 靛之森：官網 404；成員「伊索渡」不在資料庫。
- 蜂沛創意行銷有限公司：查不到任何官方資料，與璐洛洛的關係也沒有出處。
