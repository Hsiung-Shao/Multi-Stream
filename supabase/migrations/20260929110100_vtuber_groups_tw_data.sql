-- 台灣 VTuber 團體標籤（資料）。由 scripts/build-group-migration.mjs 產生，不要手改。
-- 成員：docs/TaiwanVTuberTrackingDataJson-master/api/v2/all/groups.json（2026-03 快照）
-- 分類：scripts/data/tw-groups-2026-09.json（2026-09-29 查證）；待確認事項見 scripts/data/tw-groups-pending.md
-- 依賴 20260929110000_vtuber_groups_kind.sql（kind／parent_id 欄位與 member_count trigger）
-- 部署順序：本檔 → Edge Function（snapshot 讀 kind／parent_id）→ 前端；避開排程時段（單一交易約 700 列 update）
-- 回滾（依第 0 段的備份還原）：
--   update public.vtubers v set group_id = b.group_id, activity = b.activity from backup.vtubers_group_20260929 b
--     where b.id = v.id and (v.group_id is distinct from b.group_id or v.activity is distinct from b.activity);
--   delete from public.vtuber_groups g where not exists (select 1 from backup.vtuber_groups_20260929 b where b.id = g.id);
--   update public.vtuber_groups g set kind = b.kind, parent_id = b.parent_id, verified_at = b.verified_at, source_url = b.source_url, note = b.note, member_count = b.member_count
--     from backup.vtuber_groups_20260929 b where b.id = g.id;
--   確認無誤後：drop table backup.vtuber_groups_20260929, backup.vtubers_group_20260929;

-- ===== 0. 套用前備份（回滾用；backup schema 不經 PostgREST 對外）=====
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.vtuber_groups_20260929 as select * from public.vtuber_groups;
create table if not exists backup.vtubers_group_20260929 as select id, group_id, activity from public.vtubers;

-- ===== 1. 團體（查證過的覆蓋；未查證的已存在就不動）=====
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('春魚創意', 'TW', 'agency', '2026-09-29', 'https://zh.wikipedia.org/zh-tw/春魚工作室', '春魚創意股份有限公司（統編 50968413），與 STORIA 合辦 SquareLive 品牌')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('極深空計畫', 'TW', 'agency', '2026-09-29', 'https://zh.wikipedia.org/zh-tw/春魚工作室', null)
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('瑟拉斯蒂歐', 'TW', 'agency', '2026-09-29', 'https://zh.wikipedia.org/zh-tw/春魚工作室', null)
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('諦覓司', 'TW', 'agency', '2026-09-29', 'https://zh.wikipedia.org/zh-tw/春魚工作室', null)
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Para≠dox', 'TW', 'agency', '2026-09-29', 'https://gnn.gamer.com.tw/detail.php?sn=304923', null)
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('靛之森', 'TW', 'agency', '2026-09-29', 'https://ainomori.tv/', 'Ainomori；由艷世 YENZdesign 製作營運')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('ReLive Project', 'TW', 'agency', '2026-09-29', 'https://relive-project0.com/', '媒體專訪執行長，簽約 12 位')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('MOMOMO團', 'TW', 'circle', '2026-09-29', 'https://www.facebook.com/p/Momomo%E5%9C%98-%E3%83%A2%E3%83%A2%E3%83%A2%E5%9B%A3-100064154940201/', '傾向社團（查不到經營方）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Lamplighter5', 'TW', 'personal', '2026-09-29', 'https://www.youtube.com/channel/UCmO8xJjIYrv6kGtGJF_nIMg', '愛琳諾菈的個人工作室（兼營素材販售）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Limnos', 'TW', 'agency', '2026-09-29', 'https://game.udn.com/game/story/122089/9698123', '2026-08-17 宣布，2026-10-31 停止營運；成員 10 月陸續畢業')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('夢想之都工作室', 'TW', 'agency', '2026-09-29', 'https://www.dreamcity.studio/vtuber/', '傾向企業勢（官網徵選與商務信箱，查不到公司登記）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('雲際線工作室', 'TW', 'agency', '2026-09-29', 'https://vtubervibes.com/industry-map/', 'Cloud Horizon；產業地圖列為經紀公司')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('點一璃Glaçage', 'TW', 'agency', '2026-09-29', 'https://x.com/GlacageDesign', '傾向企業勢（設計工作室營運藝人，查不到公司登記）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('哇啦咚咚工作室', 'TW', 'agency', '2026-09-29', 'https://vtubervibes.com/industry-map/', 'WaraDoNDoN；旗下 Reverie')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('子午計畫', 'TW', 'agency', '2026-09-29', 'https://official-website.meridianproject.tw/talents', '子午計畫有限公司；新團沉珀 Aetris 2026-09-18～20 出道（頻道未收錄）；玖玖巴、KSP 為合作藝人')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('蜂沛創意行銷有限公司', 'TW', 'agency', '2026-09-29', null, '璐洛洛的經紀公司（依漏列查證的名稱對應，未逐筆附出處）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('SquareLive', 'TW', 'agency', '2026-09-29', 'https://zh.wikipedia.org/zh-tw/春魚工作室', '春魚創意與 STORIA 合辦的品牌；已查到子團的成員掛子團，其餘掛這裡')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Mirolive', 'TW', 'agency', '2026-09-29', null, '米諾文創娛樂有限公司（依漏列查證的名稱對應，未逐筆附出處）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('土芒果社', 'TW', 'circle', '2026-09-29', 'https://x.com/fangdongtmg', '成員頻道自註 TMG_Not_Company')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('比鄰星域', 'TW', 'agency', '2026-09-29', 'https://www.facebook.com/ProximaSector/', '傾向企業勢（Proxima Sector；查不到公司名稱）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Yololive', 'TW', 'agency', '2026-09-29', 'https://www.facebook.com/YoloLiveProduction/', '傾向企業勢（YoloLive production，高雄經營團隊，查不到公司登記）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('終焉理想庭', 'TW', 'circle', '2026-09-29', 'https://x.com/ultimateutopia8', '成員多為個人勢兼掛的共同企劃')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('超異界通信+', 'TW', 'circle', '2026-09-29', 'https://idconnect-plus.netlify.app/', '非人設定 VTuber 的共同企劃')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('織女星project', 'TW', 'circle', '2026-09-29', 'https://x.com/alyr_01', '同好團（ALYR）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('花遊工作室', 'TW', 'agency', '2026-09-29', 'https://www.moelong.com/moelongnews/archives/16213', '傾向企業勢（自稱經營團隊、參展，查不到公司登記）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('ParalReturners', 'TW', 'circle', '2026-09-29', 'https://x.com/paralreterners', '獨立團體（異箱團）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('古德文創', 'TW', 'agency', '2026-09-29', 'https://x.com/goodcc_tw', '傾向企業勢（Goodcc；以品牌名義主辦賽事，查不到統編）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('塩月家', 'TW', 'personal', '2026-09-29', 'https://shiotsukistudio.carrd.co/', '以家族設定經營')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('TSA Studio', 'TW', 'agency', '2026-09-29', 'https://vtubervibes.com/industry-map/', '時空管制署；產業地圖列為經紀公司')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('箱箱The Box', 'TW', 'agency', '2026-09-29', null, '箱箱有限公司（依漏列查證的名稱對應，未逐筆附出處）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('預見娛樂', 'TW', 'agency', '2026-09-29', 'https://www.envisionvtuber.com.tw/artist/list/all', '魔競娛樂子公司；子團 EXITUS、MeloNyx、Alluria、音雲漫步計畫、CaKano、ælis（逐人對應未查到，成員先掛公司層）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('煥悅工作室', 'TW', 'circle', '2026-09-29', 'https://x.com/huanyue_vtuber', '第三方企劃列為社團勢力')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('比爾數位科技', 'TW', 'agency', '2026-09-29', 'https://www.incgmedia.com/people/bd-rellusion-vtuber-solution', '比爾數位科技有限公司')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Leor Live', 'TW', 'agency', '2026-09-29', 'https://www.leorlive.com/', '傾向企業勢（官網自稱培育 VTuber 的台灣團隊，查不到公司登記）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Vlive Lab', 'TW', 'agency', '2026-09-29', 'https://vlivelab.com/', '未來實驗所；官網商務媒合')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('公共電視文化事業基金會', 'TW', 'agency', '2026-09-29', null, '公視 VTuber（依漏列查證的名稱對應，未逐筆附出處）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('白拓Hakutaku', 'TW', 'circle', '2026-09-29', 'https://vtuberknower.com/sumine_ruri_debut/', '台灣社團白拓')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('鹿鳴娛樂', 'TW', 'agency', '2026-09-29', 'https://x.com/MoschusHoot', 'Moschus Hoot；自有網域商務信箱、期生招募')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('Mojoy Live', 'TW', 'agency', '2026-09-29', 'https://mojoy.io/', 'MOJOY 平台（育碧台東、智寶國際等出資）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('L.M. Live', 'TW', 'agency', '2026-09-29', 'https://usadanews.com/agencies/l-m-live/', '傾向企業勢（期生制度，查不到公司登記）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('VerseLink', 'TW', 'agency', '2026-09-29', 'https://verselink.studio/member', '官網招募與成員頁')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('恋Vaichu', 'TW', 'agency', '2026-09-29', 'https://www.youtube.com/channel/UC93733Iz1fQKLJmUeiDuUmQ', '傾向企業勢（自稱經紀，查不到公司登記）；Yuki 白昭雪、幽夢聆音為合作藝人')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('SPECIAL DEFENSE SQUAD', 'TW', 'agency', '2026-09-29', 'https://x.com/sdsquad777', '傾向企業勢（公司網域信箱與徵選，查不到公司名稱）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values ('YahooTV', 'TW', 'agency', '2026-09-29', null, 'Yahoo 奇摩 VTuber 大合虎子（依漏列查證的名稱對應，未逐筆附出處）')
    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);
insert into public.vtuber_groups (name, nationality, kind) values
    ('RenewLive', 'TW', 'unverified'),
    ('Virtual Dorm', 'TW', 'unverified'),
    ('StRine Office', 'TW', 'unverified'),
    ('回家部', 'TW', 'unverified'),
    ('巧莓起酥', 'TW', 'unverified'),
    ('摸魚企鵝&廢人虎鯨', 'TW', 'unverified'),
    ('AsteriaLive', 'TW', 'unverified'),
    ('S.O.S', 'TW', 'unverified'),
    ('雷雷研究社', 'TW', 'unverified'),
    ('海線少女', 'TW', 'unverified'),
    ('Miiracle Love', 'TW', 'unverified'),
    ('芥川組', 'TW', 'unverified'),
    ('六月草.studio', 'TW', 'unverified'),
    ('FreedomLive', 'TW', 'unverified'),
    ('異次緣', 'TW', 'unverified'),
    ('YohoStage', 'TW', 'unverified'),
    ('食營同萌工作室', 'TW', 'unverified'),
    ('That Must Golive', 'TW', 'unverified'),
    ('Stardust Live', 'TW', 'unverified'),
    ('浪海數位', 'TW', 'unverified'),
    ('MLNAM', 'TW', 'unverified'),
    ('KAHO-FAMI', 'TW', 'unverified'),
    ('ACGlive', 'TW', 'unverified'),
    ('Blossom Live', 'TW', 'unverified'),
    ('東域有限公司', 'TW', 'unverified'),
    ('Psycho Live', 'TW', 'unverified'),
    ('惡貓計畫', 'TW', 'unverified'),
    ('RaZerStar', 'TW', 'unverified'),
    ('夜貓森友會', 'TW', 'unverified'),
    ('夢遊天使Myu', 'TW', 'unverified'),
    ('mlmlm', 'TW', 'unverified'),
    ('靛堂', 'TW', 'unverified'),
    ('椛花夜露', 'TW', 'unverified'),
    ('Miragion Studio', 'TW', 'unverified'),
    ('鮭貓工作室', 'TW', 'unverified'),
    ('咩屋', 'TW', 'unverified'),
    ('小倉電子企業社', 'TW', 'unverified'),
    ('CACV', 'TW', 'unverified'),
    ('地下軼樓', 'TW', 'unverified'),
    ('綿牛喵星球', 'TW', 'unverified'),
    ('星夢StarYume', 'TW', 'unverified'),
    ('異星觀測站', 'TW', 'unverified'),
    ('VirtualLive', 'TW', 'unverified'),
    ('Destiny Live', 'TW', 'unverified'),
    ('ENDlive', 'TW', 'unverified'),
    ('萌元氣', 'TW', 'unverified'),
    ('鎮魂鐘', 'TW', 'unverified'),
    ('2VR_Studio', 'TW', 'unverified'),
    ('甘甜糖罐頭', 'TW', 'unverified'),
    ('破曉鴻羽', 'TW', 'unverified'),
    ('Missing失蹤人口', 'TW', 'unverified'),
    ('迷聲夢寐', 'TW', 'unverified'),
    ('AuroraLive', 'TW', 'unverified'),
    ('FahonLive', 'TW', 'unverified'),
    ('黑耀創視', 'TW', 'unverified'),
    ('第二鈕扣風味社', 'TW', 'unverified'),
    ('毛蟲娛樂', 'TW', 'unverified'),
    ('異種族集會所', 'TW', 'unverified'),
    ('森羅異獸咖啡館', 'TW', 'unverified'),
    ('異世界瘋食堂', 'TW', 'unverified'),
    ('TSSVB', 'TW', 'unverified'),
    ('鳩巢娛樂', 'TW', 'unverified'),
    ('VoiX', 'TW', 'unverified'),
    ('星邃冒險團', 'TW', 'unverified'),
    ('貓麻生產社', 'TW', 'unverified'),
    ('AURALIA Project', 'TW', 'unverified'),
    ('ViSIR', 'TW', 'unverified'),
    ('仙域-逍遙門', 'TW', 'unverified'),
    ('狗窩娛樂', 'TW', 'unverified'),
    ('梧曦客棧', 'TW', 'unverified'),
    ('24/7', 'TW', 'unverified'),
    ('月海奇緣', 'TW', 'unverified'),
    ('Trifling Light', 'TW', 'unverified'),
    ('Wings Live', 'TW', 'unverified'),
    ('Kawas Project', 'TW', 'unverified'),
    ('Kiseki Plain', 'TW', 'unverified'),
    ('日向葵', 'TW', 'unverified'),
    ('Epoch Studio', 'TW', 'unverified'),
    ('小精靈Club', 'TW', 'unverified'),
    ('星軌工作室', 'TW', 'unverified'),
    ('王國放送局', 'TW', 'unverified'),
    ('星空鎮守府', 'TW', 'unverified'),
    ('光映島', 'TW', 'unverified'),
    ('啪啦爆擊8', 'TW', 'unverified'),
    ('UDUZ LIVE', 'TW', 'unverified'),
    ('Vsupport', 'TW', 'unverified'),
    ('九藏喵窩', 'TW', 'unverified'),
    ('兔窩', 'TW', 'unverified'),
    ('Werhaus Music', 'TW', 'unverified'),
    ('Ninth Games', 'TW', 'unverified'),
    ('Wander²', 'TW', 'unverified'),
    ('NURA studio', 'TW', 'unverified'),
    ('蘭德洛可工作室', 'TW', 'unverified'),
    ('聯合行星', 'TW', 'unverified'),
    ('汋茁其華', 'TW', 'unverified'),
    ('神秘箱工作室', 'TW', 'unverified'),
    ('Momiji Project', 'TW', 'unverified'),
    ('波游', 'TW', 'unverified'),
    ('DD箱', 'TW', 'unverified'),
    ('FS Live', 'TW', 'unverified'),
    ('悠夜 Kagari', 'TW', 'unverified'),
    ('岩月工作室', 'TW', 'unverified'),
    ('盆栽工作室', 'TW', 'unverified'),
    ('𝓝𝓸𝓬𝓽𝓾𝓻𝓷𝓮 𝄞', 'TW', 'unverified'),
    ('太陽計劃', 'TW', 'unverified'),
    ('幻星工作室', 'TW', 'unverified'),
    ('雀時', 'TW', 'unverified'),
    ('意識之上酒吧', 'TW', 'unverified'),
    ('末日怪人', 'TW', 'unverified'),
    ('Nirvøc', 'TW', 'unverified'),
    ('紀元錄工作室', 'TW', 'unverified'),
    ('LävëNdër', 'TW', 'unverified'),
    ('隆中閣', 'TW', 'unverified'),
    ('虛影工作室', 'TW', 'unverified'),
    ('輕靈', 'TW', 'unverified'),
    ('Project.V.B', 'TW', 'unverified'),
    ('弓炬計畫', 'TW', 'unverified'),
    ('M&B', 'TW', 'unverified'),
    ('五層樓Five-Story', 'TW', 'unverified'),
    ('虛書', 'TW', 'unverified'),
    ('Digital Dreamer', 'TW', 'unverified'),
    ('神域工廠', 'TW', 'unverified'),
    ('Ubitus', 'TW', 'unverified'),
    ('喵屋旅社', 'TW', 'unverified'),
    ('New Area Studio', 'TW', 'unverified'),
    ('Neo Land', 'TW', 'unverified'),
    ('幽夜工作室', 'TW', 'unverified'),
    ('未知管理局', 'TW', 'unverified'),
    ('世界殘響', 'TW', 'unverified'),
    ('特異點', 'TW', 'unverified'),
    ('Craftslive Studio', 'TW', 'unverified'),
    ('OriginS', 'TW', 'unverified'),
    ('CY Future', 'TW', 'unverified'),
    ('月半計畫', 'TW', 'unverified'),
    ('Opalight', 'TW', 'unverified'),
    ('SpatialHigh', 'TW', 'unverified'),
    ('貝德維爾事務所', 'TW', 'unverified'),
    ('架空創意', 'TW', 'unverified'),
    ('避難所', 'TW', 'unverified'),
    ('PARADISE', 'TW', 'unverified'),
    ('熊熊文化工作坊', 'TW', 'unverified'),
    ('沐屋工作室', 'TW', 'unverified'),
    ('三月小貓', 'TW', 'unverified'),
    ('雪零工作室', 'TW', 'unverified'),
    ('四季途 Season Journey', 'TW', 'unverified'),
    ('鳶尾之聲', 'TW', 'unverified'),
    ('EE Production', 'TW', 'unverified'),
    ('北門76事務所', 'TW', 'unverified'),
    ('徒步旅行', 'TW', 'unverified'),
    ('Twpaws', 'TW', 'unverified'),
    ('湮雨計畫', 'TW', 'unverified'),
    ('project: Fumetsu', 'TW', 'unverified'),
    ('百鬼獣録', 'TW', 'unverified'),
    ('寄夢', 'TW', 'unverified'),
    ('庭園工作室', 'TW', 'unverified'),
    ('真理精神病院', 'TW', 'unverified'),
    ('言夏森Dreambox', 'TW', 'unverified'),
    ('星夜工作室', 'TW', 'unverified'),
    ('仙境工作室', 'TW', 'unverified'),
    ('斂財馬戲團', 'TW', 'unverified'),
    ('風鈴檔案', 'TW', 'unverified'),
    ('森嵜光', 'TW', 'unverified'),
    ('STARLIT ERROR', 'TW', 'unverified'),
    ('忘憂村工作室', 'TW', 'unverified'),
    ('少眠工作室', 'TW', 'unverified'),
    ('MVO', 'TW', 'unverified'),
    ('Laniakea', 'TW', 'unverified'),
    ('傑仕登', 'TW', 'unverified'),
    ('夢月・Dream Moon', 'TW', 'unverified'),
    ('汐雲工作室', 'TW', 'unverified'),
    ('霧章', 'TW', 'unverified'),
    ('枕頭工作室', 'TW', 'unverified'),
    ('晝夜徘徊', 'TW', 'unverified'),
    ('MorphusAI', 'TW', 'unverified'),
    ('眾水之音', 'TW', 'unverified'),
    ('OC Studio', 'TW', 'unverified'),
    ('不叮迷你王國', 'TW', 'unverified'),
    ('海洋工作室', 'TW', 'unverified'),
    ('深湖工作室', 'TW', 'unverified'),
    ('橒界工作室', 'TW', 'unverified'),
    ('烏洛工作室', 'TW', 'unverified'),
    ('牧神工作室', 'TW', 'unverified'),
    ('漫遊宅創', 'TW', 'unverified'),
    ('可頌小狗', 'TW', 'unverified'),
    ('祈願企劃', 'TW', 'unverified'),
    ('莉貝紀錄工作室', 'TW', 'unverified'),
    ('小星人SmallAlien', 'TW', 'unverified'),
    ('和青', 'TW', 'unverified'),
    ('深層星工作室', 'TW', 'unverified'),
    ('無序樂章', 'TW', 'unverified'),
    ('Victorialive', 'TW', 'unverified'),
    ('光輝計畫', 'TW', 'unverified'),
    ('Aepro', 'TW', 'unverified'),
    ('真箱娛樂', 'TW', 'unverified'),
    ('玄米律茶工作室', 'TW', 'unverified'),
    ('星探策劃箱', 'TW', 'unverified'),
    ('神霄', 'TW', 'unverified'),
    ('DetectLive', 'TW', 'unverified'),
    ('波塔學院', 'TW', 'unverified'),
    ('GOETHE STUDIO', 'TW', 'unverified'),
    ('艾米亞斯', 'TW', 'unverified'),
    ('UMiLive', 'TW', 'unverified'),
    ('千末工作室', 'TW', 'unverified'),
    ('World Weaver', 'TW', 'unverified'),
    ('Mormitory Studio', 'TW', 'unverified'),
    ('拍咪呀', 'TW', 'unverified'),
    ('LUVMELIVE', 'TW', 'unverified'),
    ('CormaNewMedia', 'TW', 'unverified'),
    ('RUE ARK', 'TW', 'unverified'),
    ('歐姆蛋工作室', 'TW', 'unverified'),
    ('花町月', 'TW', 'unverified'),
    ('tomocora', 'TW', 'unverified'),
    ('百物宿舍', 'TW', 'unverified'),
    ('Sexy Monkey', 'TW', 'unverified'),
    ('Nocturnal Jamboree', 'TW', 'unverified'),
    ('GuardianPB', 'TW', 'unverified'),
    ('AirLife', 'TW', 'unverified'),
    ('VOICEMITH', 'TW', 'unverified'),
    ('Small Shine工作室', 'TW', 'unverified'),
    ('MiaLive', 'TW', 'unverified'),
    ('GS＠Virtual', 'TW', 'unverified'),
    ('寶寶睡工作室', 'TW', 'unverified'),
    ('Granto', 'TW', 'unverified'),
    ('RECTALE', 'TW', 'unverified'),
    ('幻雪琉璃的夢境', 'TW', 'unverified'),
    ('七二二軍團', 'TW', 'unverified')
    on conflict (name) do nothing;

-- ===== 2. 子團 → 所屬公司 =====
update public.vtuber_groups set parent_id = (select id from public.vtuber_groups where name = '春魚創意') where name = '極深空計畫' and parent_id is distinct from (select id from public.vtuber_groups where name = '春魚創意');
update public.vtuber_groups set parent_id = (select id from public.vtuber_groups where name = '春魚創意') where name = '瑟拉斯蒂歐' and parent_id is distinct from (select id from public.vtuber_groups where name = '春魚創意');
update public.vtuber_groups set parent_id = (select id from public.vtuber_groups where name = '春魚創意') where name = '諦覓司' and parent_id is distinct from (select id from public.vtuber_groups where name = '春魚創意');
update public.vtuber_groups set parent_id = (select id from public.vtuber_groups where name = '春魚創意') where name = 'Para≠dox' and parent_id is distinct from (select id from public.vtuber_groups where name = '春魚創意');
update public.vtuber_groups set parent_id = (select id from public.vtuber_groups where name = '春魚創意') where name = 'SquareLive' and parent_id is distinct from (select id from public.vtuber_groups where name = '春魚創意');

-- ===== 3. 成員（YouTube 頻道 ID／Twitch login 比對；只改有變的列）=====
-- 24/7（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '24/7' and (v.youtube_channel_id in ('UCFHp23ZN_bYsKdhlLFktDXQ', 'UC3_kptC3eyenWQspEINiGTg', 'UCY2-hrUEpfZdrT_oTIOIOJQ') or lower(v.twitch_channel_id) in ('hyougetsu_kona')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 2VR_Studio（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '2VR_Studio' and (v.youtube_channel_id in ('UC992c3VruNlDkyy2n0sdRHg', 'UCV5p5X-NmnQV7QoWJTdLkPw', 'UCWnQY4o7Hn1LxmGQQNCQPUA') or lower(v.twitch_channel_id) in ('watanukisumie', 'nekomurany')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 七二二軍團（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '七二二軍團' and (v.youtube_channel_id in ('UCaN_Pq3x9pzhb7t9KhxQm8Q', 'UCtWuTDvZeZ09COJ2SjfESzQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 九藏喵窩（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '九藏喵窩' and (v.youtube_channel_id in ('UCrTIDW9xcII2lNh3ZF_yKiQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 千末工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '千末工作室' and (v.youtube_channel_id in ('UCNGKw7M47KNzmxkNMFAE9Wg', 'UC3m48I8fHNBuEXHfuy2ppdw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 土芒果社（7）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '土芒果社' and (v.youtube_channel_id in ('UCnSa7dnmEf6bmyS_34yqE_A', 'UCi6HZuQJ1QHN3LJ779X1EAA', 'UCNgms2IR_7RFKkgajL46DYQ', 'UCytoAdAYF9yalqzoc_akZBQ', 'UCPI7UzTUFM6VqQqZA10OxZg', 'UC_pQrqWJKPsFu7b2mGk1X2Q', 'UCLVIxrXH6oWTcrT1-2C8x3A') or lower(v.twitch_channel_id) in ('lancalv777', 'shiliyahamster', 'tmg_krl', 'shounenwind', 'tmgfangdong')) and v.group_id is distinct from g.id;
-- 子午計畫（15）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '子午計畫' and (v.youtube_channel_id in ('UC_aaEh6TaE5VpA_zQTUCcNQ', 'UCZTw6BZCzfjCarjJMRpU0Wg', 'UCxI5FyblWfEVBJDbSwRPzyw', 'UCbTv4OeHE9p1akLhKfgW8WQ', 'UCk-n2qPASA48IPgtYAsLYJg', 'UCUEXMpxIa7le_CK6yYRAboA', 'UCqHgN9V9RFFH1C2TpwdF5Ig', 'UCHVkG_htYhk-JmJ5RWYMXzw', 'UC2mtxQezpgWjqMXF6WkuMiw', 'UC8zQumEzXBpWSmbHmr8wMKw', 'UCyO8Nae_zF-OpxtbL01Dwow', 'UC6NXFJInhUYGdKeFHhPrtpA', 'UCB3at_yiqFJh31c0ztE4MVA', 'UCjmLYMFRI56fZteeYu7kkpg', 'UCcyTlQ92NIJ4fYR45OFpFQQ') or lower(v.twitch_channel_id) in ('seki_meridian', 'kirali_neon', 'yuzumi_neon', 'reirei_neon', 'itsuki_ianvs', 'iruni_ianvs', 'hibiki_meridianproject', 'sakuro_moonlit', 'hitomi_teraz', 'koyuki_teraz', 'hiyori_teraz', 'sachi_teraz', 'yoruno_moonlit', 'oboro_moonlit')) and v.group_id is distinct from g.id;
-- 小星人SmallAlien（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '小星人SmallAlien' and (v.youtube_channel_id in ('UCzL1z9Mnr9Oba5ZjAqfa3lw', 'UCN0Tx0nCvHL71YIZ21H9vUg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 小倉電子企業社（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '小倉電子企業社' and (v.youtube_channel_id in ('UCyZZMKRn-mUEkPzaqa9b6bg', 'UCk5u6Wy54Xxh_btEutjgGdQ', 'UCIHa1U-5IxP8KK5mcLeAymg') or lower(v.twitch_channel_id) in ('kitsunekon_0112', 'parasesora')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 小精靈Club（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '小精靈Club' and (v.youtube_channel_id in ('UCgQIkqaNmT5RfYOBt1IXOWA', 'UCrhApfwyH6UPIZ4yLFfbtiQ', 'UCekLbPJZ_YpU-yRbU1gZnjQ', 'UCQELC9wsHCCyMuLmF5dI4Ag', 'UCXqOBAxV78wVjM6FVXNUf7w') or lower(v.twitch_channel_id) in ('nyarukoizumi', 'mathchiwawa', 'glisgliridae', 'happiegrassie', 'csisvtuber')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 弓炬計畫（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '弓炬計畫' and (v.youtube_channel_id in ('UC2L_bLnqBUwNRRmHZ209JPg', 'UCqbaGfFhH40YSjzUJ8Dz6cg') or lower(v.twitch_channel_id) in ('mayj0501', 'jeanneovo')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 不叮迷你王國（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '不叮迷你王國' and (v.youtube_channel_id in ('UC6Kzd6bGwXOtFYfsyby5v3w')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 五層樓Five-Story（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '五層樓Five-Story' and (v.youtube_channel_id in ('UCIdyCErIAg0hH9p_PAwJ2pw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 公共電視文化事業基金會（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '公共電視文化事業基金會' and (v.youtube_channel_id in ('UCoOv_rsFOBChxYmi4dvtiVQ', 'UC62U5wc4o_VZTNecAkR0yEg')) and v.group_id is distinct from g.id;
-- 六月草.studio（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '六月草.studio' and (v.youtube_channel_id in ('UC9ymconZOuIj-cuWpEUyjUg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 太陽計劃（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '太陽計劃' and (lower(v.twitch_channel_id) in ('sruo0303')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 少眠工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '少眠工作室' and (v.youtube_channel_id in ('UCiDa7h0d9SWsD3YU2CR1orA') or lower(v.twitch_channel_id) in ('pikayama')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 幻星工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '幻星工作室' and (v.youtube_channel_id in ('UC-EjgncbtMlxYj00KKhDKMA') or lower(v.twitch_channel_id) in ('oviii_elves')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 幻雪琉璃的夢境（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '幻雪琉璃的夢境' and (v.youtube_channel_id in ('UCSOpxKLXctMuO3Q1LFSHs_Q') or lower(v.twitch_channel_id) in ('fantasydreamck')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 日向葵（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '日向葵' and (v.youtube_channel_id in ('UCGH-DS6rKu7-_AxuvZIQpWg') or lower(v.twitch_channel_id) in ('hinata__0419')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 月半計畫（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '月半計畫' and (v.youtube_channel_id in ('UCTdWj0Qqf4MKZuQfOpbBv-w') or lower(v.twitch_channel_id) in ('auspiciousfox')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 月海奇緣（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '月海奇緣' and (v.youtube_channel_id in ('UCmXd8CqkOVa-FH5WBIYap7w', 'UCAxJmR5Ey0uLySfktEW4vVQ') or lower(v.twitch_channel_id) in ('sariel_0041', 'coralmeris')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 比爾數位科技（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '比爾數位科技' and (v.youtube_channel_id in ('UCjz2B8zRiSenHFW1nuntY6A', 'UCmkENWGZeOKjJdeXhY0yPkg', 'UCLURUhaw4kqjhb_Y4rAb7ig')) and v.group_id is distinct from g.id;
-- 比鄰星域（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '比鄰星域' and (v.youtube_channel_id in ('UCRvxgWZV-LYr0sPP0nmpTBw', 'UCOseNFJYQJVDB-9D3egG4ZA', 'UCeZSiI9Kcyld9AjLuUdNKkA', 'UCZuQvHMvbkuPOT8MpDVgh_Q')) and v.group_id is distinct from g.id;
-- 毛蟲娛樂（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '毛蟲娛樂' and (v.youtube_channel_id in ('UC6sa4q1MO4eLs2kq2a4FAnQ', 'UCxyTFoXTDyo16R2zBEMPZrw') or lower(v.twitch_channel_id) in ('jia0bana')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 王國放送局（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '王國放送局' and (v.youtube_channel_id in ('UC4b1QDTIo0g4LmnOrTB_ntw', 'UC6jlmcB7ro9YVOYjSz3BIdQ') or lower(v.twitch_channel_id) in ('hanasaki_vtuber')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 世界殘響（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '世界殘響' and (v.youtube_channel_id in ('UCWUKckeGJO8l1VJ7wbKtnrg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 仙域-逍遙門（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '仙域-逍遙門' and (v.youtube_channel_id in ('UCnLD_X_sYv2xUBOdttZQz7g', 'UC6Z7p-C4lUYImqlBuenfv4Q', 'UCgMaKJIsPsAUcKkDcYMk3kw') or lower(v.twitch_channel_id) in ('enchan_2018', 'zhanxi0225', 'shoyo0229')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 仙境工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '仙境工作室' and (v.youtube_channel_id in ('UC_G9v05tBdyz-c2FE8wUjXg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 北門76事務所（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '北門76事務所' and (v.youtube_channel_id in ('UCSEpCEZrPxrBqlnVkElLUQQ', 'UCB55pRcRNqH1c2ZqeFam8aA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 古德文創（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '古德文創' and (v.youtube_channel_id in ('UCQSkfRwoAVG0J5MUo2spPWw', 'UC6gt86ZrdTydcg-rZ-isikw', 'UCsIBbeApZk3ZKq2khrxpMNQ') or lower(v.twitch_channel_id) in ('noon_0606', 'hatsuki_vt')) and v.group_id is distinct from g.id;
-- 可頌小狗（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '可頌小狗' and (v.youtube_channel_id in ('UC3QjEUXsITPkGo-yP3p1K0A') or lower(v.twitch_channel_id) in ('merries_0625')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 四季途 Season Journey（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '四季途 Season Journey' and (v.youtube_channel_id in ('UCoR5Toej3O1X8H40fDJk2Cg', 'UCjggmilrzC1QvT7LyXFCxJg') or lower(v.twitch_channel_id) in ('haini_tw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 巧莓起酥（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '巧莓起酥' and (v.youtube_channel_id in ('UCOUw2PkiemR-hdf2DszrdNw', 'UCd6PIZ_wu7XivGyAaXmAyDA') or lower(v.twitch_channel_id) in ('lililu015vt')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 未知管理局（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '未知管理局' and (v.youtube_channel_id in ('UCcrslzwhP0tv37zN94OVqzg') or lower(v.twitch_channel_id) in ('ailywanderwulf')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 末日怪人（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '末日怪人' and (v.youtube_channel_id in ('UC_IhhQb1HSk7-yeoMiGJuAg', 'UCLZ0RYHEKdDtIayXc_rgVBA') or lower(v.twitch_channel_id) in ('isabella_doyle', 'asahinayukito')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 玄米律茶工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '玄米律茶工作室' and (v.youtube_channel_id in ('UCPxiiZmEyY60nTiQojsPu4g')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 甘甜糖罐頭（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '甘甜糖罐頭' and (v.youtube_channel_id in ('UCwSM1h0NmnmSuHVBFBIomXg', 'UCBI313vfa0ynUKpoFBj1NVg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 白拓Hakutaku（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '白拓Hakutaku' and (v.youtube_channel_id in ('UCp-wQLUET-HaNfoKpf6dmXg', 'UCzejD0l__Vf3iqUiONTnJXw', 'UCqXmDIn2fCIkotjmpxNGa_Q') or lower(v.twitch_channel_id) in ('sumizomeyuu')) and v.group_id is distinct from g.id;
-- 光映島（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '光映島' and (v.youtube_channel_id in ('UCWVMRblXYqzZCyXkybChtSg', 'UCtvC0MVBBgYUIqtmwwdwUtA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 光輝計畫（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '光輝計畫' and (v.youtube_channel_id in ('UCHvX07nkiZ04oaW2XzhoCYA', 'UCN8aQR5yBPzgqqsmz6qpIug', 'UCqbJ_qJEcrgvsuhVDC8uujw', 'UCVEzz5wJz0sAK27p7-Gupiw') or lower(v.twitch_channel_id) in ('ventuscolumba')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 回家部（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '回家部' and (v.youtube_channel_id in ('UCRe0-5eDowwCkaxsIBUN91w', 'UCw9ekU9efg0j8PJ7Lw6D1zw') or lower(v.twitch_channel_id) in ('yessxeisea', 'gohome3305')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 地下軼樓（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '地下軼樓' and (v.youtube_channel_id in ('UCUPFo7X6mk00JvCyCxM3QXQ', 'UCcZMCKa_ulPYA72jTAc9V3Q')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 汋茁其華（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '汋茁其華' and (lower(v.twitch_channel_id) in ('datura_cherish')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 汐雲工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '汐雲工作室' and (v.youtube_channel_id in ('UC0hS8ZGEcMeHgrmQlYkeZqg', 'UCxIHVP1chADhLkQrOLb9SfQ') or lower(v.twitch_channel_id) in ('123miiimiii33', 'mikadoera')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 百物宿舍（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '百物宿舍' and (v.youtube_channel_id in ('UCKSuXkZmZAk11JWqYx-y1_w')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 百鬼獣録（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '百鬼獣録' and (v.youtube_channel_id in ('UCrNBnMwtQ-H9I1E_4bDM-2A')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 艾米亞斯（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '艾米亞斯' and (v.youtube_channel_id in ('UCD1hluaWiVoLI-t7Pe75nLA') or lower(v.twitch_channel_id) in ('ett_npax')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 忘憂村工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '忘憂村工作室' and (v.youtube_channel_id in ('UCAS04oH-gUUZ_LLW3iBMvmw') or lower(v.twitch_channel_id) in ('izumi_komu_vtuber')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 沐屋工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '沐屋工作室' and (v.youtube_channel_id in ('UCP3PLGATDXOc6hdl9jP5qxQ', 'UC29rMqriZ-ORExoNqanyCWA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 言夏森Dreambox（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '言夏森Dreambox' and (v.youtube_channel_id in ('UCDZpKT4Gc-_lm5c5G8_cHbw', 'UCT03vmXTcV6njG_52YDhjsg') or lower(v.twitch_channel_id) in ('jiang_tarng', 'murmurael_vtuber')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 貝德維爾事務所（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '貝德維爾事務所' and (v.youtube_channel_id in ('UCbYJEg5nMIwyMlc5NnybAVQ', 'UCoSvLCd3KA9oFe60zorrP_w')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 兔窩（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '兔窩' and (v.youtube_channel_id in ('UCMwjykBSiTTq359UI_vgZWQ', 'UCsd6EaK4vzfd49swGXAR-bQ') or lower(v.twitch_channel_id) in ('uisaki_ch')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 和青（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '和青' and (v.youtube_channel_id in ('UCcrq7QhntdlxJCY9jqKIlcw') or lower(v.twitch_channel_id) in ('xiwu0315')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 夜貓森友會（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '夜貓森友會' and (v.youtube_channel_id in ('UCuM709BhGrE8RzvcLoXLVfw', 'UC9gLGP1Al6npy1XiypTQ9Wg') or lower(v.twitch_channel_id) in ('minamoto_kenta')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 岩月工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '岩月工作室' and (v.youtube_channel_id in ('UCtfmiTqLDuSs3D5vdfroSXg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 拍咪呀（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '拍咪呀' and (v.youtube_channel_id in ('UCH6cILtvg8OXnFoNIDich8A')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 東域有限公司（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '東域有限公司' and (v.youtube_channel_id in ('UCD-DzQygkLQWpGQwdT6se5g') or lower(v.twitch_channel_id) in ('eastairuier')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 枕頭工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '枕頭工作室' and (v.youtube_channel_id in ('UCWcKOWQ0sYqDE8662NBBmgw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 波游（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '波游' and (v.youtube_channel_id in ('UCo10okdUhEV1idrnmPFbE9Q', 'UCDB8BvPQwyV5eaD2DqFhKqA', 'UCSgyduVME7t2_pGNwutsLXA') or lower(v.twitch_channel_id) in ('lingna0', 'ayazuki_owob')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 波塔學院（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '波塔學院' and (v.youtube_channel_id in ('UCHjjy8hu6UUeQAPd7TZPqqA', 'UCtUfLRS60WoWn928B9BrzkA', 'UCt7rMCelu5GFXEf9FIAIliw', 'UCOf-zm2kuWGdf00DUX9B9Ag') or lower(v.twitch_channel_id) in ('tsukimiruby', 'mizuminanari', 'akuma_kamir', 'maumiruna')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 牧神工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '牧神工作室' and (v.youtube_channel_id in ('UCRrciDpJuoEOVZoEN6JNZew', 'UC1R4lzplAz4-THgi2evhPrA') or lower(v.twitch_channel_id) in ('akuriroa_cafe')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 狗窩娛樂（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '狗窩娛樂' and (v.youtube_channel_id in ('UCQ_Q34SO3wydZuI5FKhN-0g') or lower(v.twitch_channel_id) in ('kankona0616')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 芥川組（11）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '芥川組' and (v.youtube_channel_id in ('UCH2dAEECzniZIShBZ50Iujg', 'UC5QZFeVsxNcNlKKqPqUaw6g', 'UCLO12aWGUbbBIIoBrAq3SZA', 'UCilDXp9OCn51TLcWwfXcmtA', 'UCKRtoH_aSPlNG73v3didU5g', 'UCt4uzM21MBcP0aJW-fTp4-w', 'UCbekFvyr5cAWHKr3XFvPqTA', 'UCJ-gAk3Hp2LvPTsQ0g02z_g', 'UCyFnK5Qqa9P93jcBf31h9Bw', 'UCcApj9rC3dFW5RCDFIuLalQ', 'UCLIaG97_ujtKnQUShVn0XpQ') or lower(v.twitch_channel_id) in ('shumulumeifei', 'tsukumomabuchi', 'mikozawako')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 花町月（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '花町月' and (v.youtube_channel_id in ('UCDvSVOVDbvAkSXqRbpnsY4g')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 花遊工作室（6）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '花遊工作室' and (v.youtube_channel_id in ('UCK-H5yv8OpCce5xmUrbOP8A', 'UCgT4Oe--hch3cgHm2qGawYQ', 'UCZDzR5IPDY6mw0QwYI4sauQ', 'UCM-09YCojCB4x4bwwGuJANg', 'UCeaXqqFnCiWw11Gy6yLaHGg', 'UCZXmB5PxMHRJwHwy6Mdp8Zg') or lower(v.twitch_channel_id) in ('mayurasakura', 'yukari03210', 'kurobarayuria', 'narciss104')) and v.group_id is distinct from g.id;
-- 咩屋（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '咩屋' and (v.youtube_channel_id in ('UCztotA3tS2QE-wtr_VENEDA') or lower(v.twitch_channel_id) in ('elyana_tenshi')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 哇啦咚咚工作室（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '哇啦咚咚工作室' and (v.youtube_channel_id in ('UC6CpUl2thiDslRorMhd00HA', 'UCG3hBfZxzLixJPZQ9QUP_Lw', 'UCkiM6bCVlAGRkRm9R_CKbng', 'UCx-G0TH8a5kxsTIwSvheWpw', 'UCvhRtPrThIVvUebAoTkmoLA') or lower(v.twitch_channel_id) in ('luxida_reverie', 'seri_reverie')) and v.group_id is distinct from g.id;
-- 幽夜工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '幽夜工作室' and (v.youtube_channel_id in ('UCuCNTV1KyWjRP9BkBWE6pYw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 星夜工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '星夜工作室' and (v.youtube_channel_id in ('UCnVg3CrAIK7cUH-stT9gtwg', 'UC8qojRbma_Hf_mVpltw1NRA') or lower(v.twitch_channel_id) in ('kikyouhyakkain', '0yueyang')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 星空鎮守府（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '星空鎮守府' and (v.youtube_channel_id in ('UCXKAR81M10W4GshIZRFdx8Q', 'UC0rXxImvRv3TQmzv5bEuelQ') or lower(v.twitch_channel_id) in ('shuhuhu1003')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 星軌工作室（8）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '星軌工作室' and (v.youtube_channel_id in ('UCE7L5UzEG1uXelN-5MLojzw', 'UCWS_0u2yPFW87Tj_Vat3EIQ', 'UCQ9khaebcJwqcOLAVmew4cw', 'UCfoCsKaDYYnsuhy5LWIlajA', 'UC8XxcedKN6MbDBw4j-hSpng', 'UCuvHhGbhoG2s5x--zLq-f_Q', 'UCFiBwXS7AINmPl0VMSm7PWA', 'UCWIIS441zorPikHWZCya0QQ') or lower(v.twitch_channel_id) in ('zerogabriel_st', 'lancelot0726', 'skuldnoren', 'pleiadesaim_st', 'chaosshermes_st', 'siegfriedmet_st')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 星探策劃箱（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '星探策劃箱' and (v.youtube_channel_id in ('UC8D2OGk285WBGPXf6_WeY0g') or lower(v.twitch_channel_id) in ('planet_murray')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 星夢StarYume（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '星夢StarYume' and (v.youtube_channel_id in ('UCSu05mqOOANQKqCzfIsWbBg', 'UCmzN7QzK0-UysrznOawK3KA') or lower(v.twitch_channel_id) in ('bobo20060528', 'kon_azusa')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 星邃冒險團（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '星邃冒險團' and (v.youtube_channel_id in ('UC00mdfobZI9yJMs8sLA7Qvg', 'UCIH7hJAxEGAsQn_69zxL_qQ') or lower(v.twitch_channel_id) in ('tsume_neko', 'amanameiru')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 架空創意（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '架空創意' and (v.youtube_channel_id in ('UCnL1r_Kq-LkzZTVUTqkyHDA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 盆栽工作室（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '盆栽工作室' and (v.youtube_channel_id in ('UCPbKEYseXDW6BeEn5yF-UZA', 'UCCiW5TMQLWkSh1hY8RaF85A', 'UC1xswACZSks4QGPzLbz63-g', 'UCWV77Za-GqRh-khZ1OvjhAw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 祈願企劃（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '祈願企劃' and (v.youtube_channel_id in ('UCQeV9bTiSg_ZoDbWIAbRnGg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 紀元錄工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '紀元錄工作室' and (v.youtube_channel_id in ('UCf1jpBRNndGPWDWzFJzhs2w', 'UCIw08Q0BqPfAvZVlEWR8Exw') or lower(v.twitch_channel_id) in ('yelingdehuliwo', 'uasdango')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 風鈴檔案（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '風鈴檔案' and (v.youtube_channel_id in ('UClgF7eBTZyxa3xfmUEmy_FA', 'UCTauw9yzg0R9wivVSvrb4aw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 食營同萌工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '食營同萌工作室' and (v.youtube_channel_id in ('UCCAX4CybGDLYSo7AbUC6y7Q')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 庭園工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '庭園工作室' and (v.youtube_channel_id in ('UCDN0bgB6eV449padl-i4jcg') or lower(v.twitch_channel_id) in ('vtuber_eirlys')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 徒步旅行（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '徒步旅行' and (v.youtube_channel_id in ('UCMnqgLKZOZkQJamWXOEn1fQ', 'UCfjHFsnBds1V324YXpRvKRg') or lower(v.twitch_channel_id) in ('oriyukioxo', 'huskyun111')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 恋Vaichu（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '恋Vaichu' and (v.youtube_channel_id in ('UC9ma_ODRxN_xU5axJXcTUig', 'UCB_kyxO0NIzYtfFXElFsBsA') or lower(v.twitch_channel_id) in ('77_yuunana', 'dontunana')) and v.group_id is distinct from g.id;
-- 浪海數位（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '浪海數位' and (v.youtube_channel_id in ('UC4J0GZLM55qrFh2L-ZAb2LA', 'UCsz4S63Ok7PVPoV_X6E4BbQ', 'UCp07nY5O3KYa01BCFL5u-Qw') or lower(v.twitch_channel_id) in ('nyoro0606tw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 海洋工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '海洋工作室' and (v.youtube_channel_id in ('UCwC2-aQxB_OFLKWgQGbsZeg', 'UC_5TmFX-OvvH9oxls68CLzw') or lower(v.twitch_channel_id) in ('starocean_0911')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 海線少女（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '海線少女' and (v.youtube_channel_id in ('UCPB-0LpsXXP6ESub6sztHbg', 'UCHP9FijmWPSSHvAAb8jscdg', 'UCldQ1IYOI5-sTPBuWBUv08w')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 烏洛工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '烏洛工作室' and (v.youtube_channel_id in ('UCDvCHf5vVuEomj6OG-2D6Yw') or lower(v.twitch_channel_id) in ('da_ton_brother')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 特異點（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '特異點' and (v.youtube_channel_id in ('UC77WLjMNDEdTuPtv7qimv5w') or lower(v.twitch_channel_id) in ('koharuhana526')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 真理精神病院（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '真理精神病院' and (lower(v.twitch_channel_id) in ('uryu_ryuu')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 真箱娛樂（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '真箱娛樂' and (v.youtube_channel_id in ('UCMQMqSv6iyIYYKxTxi0E_oA', 'UCjO_XiZ-OBHG6gbQRXzvaqw', 'UCP_0mBkSttO-zG1ENJWSvQg') or lower(v.twitch_channel_id) in ('elara_saintess', 'marcinee_soleil', 'poppy_woolly')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 破曉鴻羽（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '破曉鴻羽' and (v.youtube_channel_id in ('UCoEf8jZzm9aq7v2F4jsrdBQ', 'UCBDFMn8a61FcfOI9NBZCF_A', 'UCqGbAJl0hP8PCI8RVZ3OgHA', 'UCzBi5O-K8VY-pHPy_ZBsAEA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 神秘箱工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '神秘箱工作室' and (v.youtube_channel_id in ('UCgNC_LzvmZdZqTn77JntMMg', 'UCrXJRY564S2VzmCJXfXTL7g')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 神域工廠（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '神域工廠' and (v.youtube_channel_id in ('UCxO1PQdYWuNf62_AMN6Z2yw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 神霄（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '神霄' and (v.youtube_channel_id in ('UCtBA1BwTQbjjbPjYcoxcohg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 迷聲夢寐（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '迷聲夢寐' and (v.youtube_channel_id in ('UCVCLScvWB2qmmYzRCV1v5hQ') or lower(v.twitch_channel_id) in ('yumebiemu')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 啪啦爆擊8（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '啪啦爆擊8' and (v.youtube_channel_id in ('UCD_u_SJjSYEtVlyQfuG-lQQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 寄夢（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '寄夢' and (v.youtube_channel_id in ('UCYAVfUD0uMkh2zAARCv2mog', 'UCNESHjLO5NPzSMLyae0wuvQ') or lower(v.twitch_channel_id) in ('yunndwodo')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 悠夜 Kagari（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '悠夜 Kagari' and (v.youtube_channel_id in ('UC_mWShTugBHCVJaZ6hoa4Rw', 'UCsw0B4JLSQ1P_2bwNy7dN6g')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 晝夜徘徊（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '晝夜徘徊' and (v.youtube_channel_id in ('UCCMewRU0D8tnmCtm0CH6TMA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 梧曦客棧（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '梧曦客棧' and (v.youtube_channel_id in ('UCDLxyfkEyujKz60oJ891Cpg') or lower(v.twitch_channel_id) in ('hanachou_aasta')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 深湖工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '深湖工作室' and (v.youtube_channel_id in ('UCjR28PTJBiCBjRAMveVCYpg', 'UCepXpWBAG5MJKKVan0jqlgw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 深層星工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '深層星工作室' and (v.youtube_channel_id in ('UCs6_EF4_G_96_qAKsPlndgg', 'UCT30dM3EDAeu9uhaGDSV6ow')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 異世界瘋食堂（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '異世界瘋食堂' and (v.youtube_channel_id in ('UC2yMFRJys_9FepK_q97bW0Q', 'UCmZOl0AoNvgZFuCRuFdJTuQ') or lower(v.twitch_channel_id) in ('bridget013', 'liweng0821')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 異次緣（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '異次緣' and (v.youtube_channel_id in ('UCctw7o1KKzr8x5YdhuRunIw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 異星觀測站（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '異星觀測站' and (v.youtube_channel_id in ('UClm0FgHwlkz1AxtAJVD-bvQ', 'UCRTyURRPcA8HOJS25MwCEuw') or lower(v.twitch_channel_id) in ('batsu_xxx', 'nagi2561')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 異種族集會所（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '異種族集會所' and (v.youtube_channel_id in ('UCkGLJWP8pEa22yIrDBEkmoQ', 'UCbnj_3bVnD6MZJbXSZlTkFQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 眾水之音（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '眾水之音' and (v.youtube_channel_id in ('UC1yoRL7QUKx5HF3ZgGJ8tUA') or lower(v.twitch_channel_id) in ('taotietaotao')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 第二鈕扣風味社（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '第二鈕扣風味社' and (v.youtube_channel_id in ('UC72QDntJADIJpkbwX0iE7GQ', 'UCx_rqgNN7LmcOy_IBXOiqOg', 'UCll_ZwHSd6NLmkUBCND3vJw', 'UCHr_jFaElcYIv10iWCOAayQ') or lower(v.twitch_channel_id) in ('enomu165', 'sakurayona_0517', 'izzackeyzz')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 終焉理想庭（12）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '終焉理想庭' and (v.youtube_channel_id in ('UCrsTmr4ZBqtb5TtX_w_wRLw', 'UCqhvd4cBO8yOp611B6YhxfQ', 'UCLHSj-ZnzmpQlZuUcnXMoVg', 'UCsojcH8OTrg-imVpZzQ6MSw', 'UCu6ElyxgXHVRH3uXyswhoSg', 'UClMx7MU0HLnRuybeYlNxisg', 'UCcXogpVnU_WPK7a66nFM01Q', 'UCUhYqNYFmyP6MWGIZX9gndA', 'UCOdO7TWkP9Ni9vrxkl1Radg', 'UCTxs9vSVMBqAGQw-RiZR7UQ', 'UCxR4d1Wq7BRNtYIAmJsnBkA', 'UCLRlFFAW2af4g3f1dZ2udZg') or lower(v.twitch_channel_id) in ('esmea_princess', 'aesopdu', 'kazeimo', 'siroya_neilson', 'utsu12', 'colamoonie', 'kuroyo0411', 'yunyun_vt', 'yuutatsubasa', 'shinyuki2511')) and v.group_id is distinct from g.id;
-- 莉貝紀錄工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '莉貝紀錄工作室' and (v.youtube_channel_id in ('UC7kSWciGt1XAbOuJcnjYCzg') or lower(v.twitch_channel_id) in ('liberecbelle0621')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 雀時（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '雀時' and (v.youtube_channel_id in ('UCcvtVLaYsdCZ7TzCeUOLLEQ') or lower(v.twitch_channel_id) in ('youlazylingyue')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 雪零工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '雪零工作室' and (v.youtube_channel_id in ('UCb4_riz_16M21KFCb1uCdNQ') or lower(v.twitch_channel_id) in ('cnvtuberlan')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 鹿鳴娛樂（7）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '鹿鳴娛樂' and (v.youtube_channel_id in ('UCdOts-q5Vf5Ks3VAd5bqZCQ', 'UC7tT0vGqGZM8xYO4SU79eGg', 'UCbo22WCWSSBCL-9lgBb7Q_Q', 'UC-4cf422O9xA8W4FpBIgtAg', 'UC1qgH6rkw-_NfbZw9Z8_XXA', 'UCEAlNY9wOT4CScerrE9zpuA', 'UCrTIAz6m9b5kXW8nY_X-KRQ') or lower(v.twitch_channel_id) in ('feliaaxtris')) and v.group_id is distinct from g.id;
-- 傑仕登（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '傑仕登' and (v.youtube_channel_id in ('UCcKtRf5XDAEX6hwIIJAY2Zg') or lower(v.twitch_channel_id) in ('jusko_jd')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 喵屋旅社（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '喵屋旅社' and (v.youtube_channel_id in ('UCKIr3U5szSJgpFJrk-6A5_Q')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 惡貓計畫（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '惡貓計畫' and (v.youtube_channel_id in ('UCSnJ7To9jR42Xx3Puf1Ar6Q', 'UC4wxRayAGJSHWHZPhgTApyg') or lower(v.twitch_channel_id) in ('ness9s1222')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 森嵜光（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '森嵜光' and (v.youtube_channel_id in ('UCDbWrLajmO0PugZ5TLQBO7Q') or lower(v.twitch_channel_id) in ('morisakihikari00')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 森羅異獸咖啡館（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '森羅異獸咖啡館' and (v.youtube_channel_id in ('UCVZZ2gjBAY6N3OKMbZa0bzw') or lower(v.twitch_channel_id) in ('aikunkuma_vtuber')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 椛花夜露（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '椛花夜露' and (v.youtube_channel_id in ('UCAVh0Elx_7eImXZ2pBMhz6A', 'UCUazk34P9ao_93Myb-EQz_A')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 湮雨計畫（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '湮雨計畫' and (v.youtube_channel_id in ('UC-ofgJSz-Kzh66tNkkV6L9g', 'UCr7239VjpEoWOhaKgwsiPVQ', 'UC2MrqeBPevA7nr4BB9RZXaQ', 'UC9Ww_etAaUicE7Niyp8IIKA') or lower(v.twitch_channel_id) in ('fullmoonnenegi')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 無序樂章（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '無序樂章' and (v.youtube_channel_id in ('UCaTcioLFOsSQt6sO0ZYDKxQ', 'UCAM95WiYRjMoEUy59R_HM8w', 'UCyJfPOZiC2J1Kh59iQo1D9Q', 'UCkq5f8AhRpFKN4nivtY9bTg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 萌元氣（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '萌元氣' and (v.youtube_channel_id in ('UC4ffyzHZdC_9wfGzifSb2iQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 虛書（6）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '虛書' and (v.youtube_channel_id in ('UCvlPG1CSF4J4WA0MzYTwAJQ', 'UCAfiRkjKJGunD08gOMzzudg', 'UCaT6UGHTSb9MuT9oqR2hBQg', 'UC2mWHsB3PDWJh-jzBV-2nLA', 'UCtt0RMh3bRSnaRo7sKasZtg', 'UCmCGHEgMhoO94LkEhdNXWbw') or lower(v.twitch_channel_id) in ('suzunaa_vt')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 虛影工作室（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '虛影工作室' and (v.youtube_channel_id in ('UC9onSgZ3eYYW_5W3ti-6vRw', 'UClvuTT2xEG83mzaiM73StSw') or lower(v.twitch_channel_id) in ('mo_chan_neko')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 超異界通信+（6）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '超異界通信+' and (v.youtube_channel_id in ('UCJICMxLdpfvH2nXPqaUmhfw', 'UCftYR77MPeodTgYv-3oK17w', 'UC-uFyVEjZgI9cX-ozKqD0iA', 'UC5MvrBsD6i0UOZYwtn2dfjQ', 'UCVS0Fz8KerrUdaxEsCmMbNg', 'UCDR73i_Lwp-aQSwMzUX-61A') or lower(v.twitch_channel_id) in ('remon031158', 'rutanvtuber')) and v.group_id is distinct from g.id;
-- 隆中閣（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '隆中閣' and (v.youtube_channel_id in ('UCC8odLa4v3aKiYLhmcpMPBw', 'UCYt_Zqg64jckuOcFgrqXdMA', 'UCIwo1Wnk1rpshiiiV91fFPA') or lower(v.twitch_channel_id) in ('wolonggechen', 'fishchouching', 'phoenixsifong')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 雲際線工作室（8）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '雲際線工作室' and (v.youtube_channel_id in ('UC-o-1qjKkMLq-ZFxXIzOUBQ', 'UCxWAL-c1psONO_DfG-cq2iA', 'UCxYkBSXKRgbxVwwqBQ_sy0w', 'UC2H5XpafT4is1p3e5WkwLpQ', 'UCJ4VZaUiVC2vpN7TXG85M5g', 'UC_soGpcb7SORsk5yzHLMdTQ', 'UCmLSgrqNG38HAk6a1RqmTmg', 'UCQyHnb5K96r2sj78Bi6Hl3w') or lower(v.twitch_channel_id) in ('konyunubye', 'caren_surfdemon', 'zhoumo_vtuber')) and v.group_id is distinct from g.id;
-- 黑耀創視（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '黑耀創視' and (v.youtube_channel_id in ('UCOM-k_e60saQjIkA8m4sqzw', 'UC4CbDxYuMvVA3g1-PA1ONDw', 'UC0V3jKAZ0m45g1CsTnnECuQ') or lower(v.twitch_channel_id) in ('lusaminach', 'sharronsu_ch', 'yabiyurich')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 塩月家（10）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '塩月家' and (v.youtube_channel_id in ('UCq6HhdBp9Si2oXpfEo2hIkQ', 'UCvpGDnwbsrEj1M-JvNaImmg', 'UCkyjyDvMaZp8vcLTCpUzIAw', 'UCkfIwowJXn4heLTONuekHJg', 'UC80oxVQetwx1XE7ELnjwxEQ', 'UC1KQjbVUnIWRxfLJLzw4VTg', 'UCsooijbmr9CkOmymKgaFn3w', 'UCFWmWCeBnAyKwcJCSzWEISw', 'UC1PNIFNGp2EljmBOfm-_cGg', 'UCRtJ3eml4ZTOhPwlfrTPooA') or lower(v.twitch_channel_id) in ('molilyqq', 'chalortti')) and v.group_id is distinct from g.id;
-- 意識之上酒吧（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '意識之上酒吧' and (v.youtube_channel_id in ('UCWrFaygYeNiBSt4wJTdgN0w', 'UCVOjG32--UxKbiCkU48xOEg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 極深空計畫（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '極深空計畫' and (v.youtube_channel_id in ('UCwzpXmWAFEVKH3VzwvSlY_w', 'UCFiIsVOC1p_gfTYDYXXfl4g', 'UCIf6cffSRZqS7TUXbUAK_hw', 'UCLeyYlqnD5k1fbZIIE4eTsg') or lower(v.twitch_channel_id) in ('earendelxdfp', 'nemesisxdfp', 'cygxdfp')) and v.group_id is distinct from g.id;
-- 煥悅工作室（6）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '煥悅工作室' and (v.youtube_channel_id in ('UCYWie--8Wpze4uSI3m8m2pw', 'UCkJO2VqSEJscYWkz40_QhYw', 'UCHCcbYsgoHYPQCTOk7Nn-qg', 'UCtLoVwXGnnoTggr01mNe_fQ', 'UCi3lAlo2h1N5eKlC2fak0Bw', 'UC5NOIm-CMZx6exJhRSx7yGw') or lower(v.twitch_channel_id) in ('usamori', 'nanakyuu301', 'lupulu0524', 'miaoti0127', 'jujuneeroi', 'yourendesu')) and v.group_id is distinct from g.id;
-- 瑟拉斯蒂歐（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '瑟拉斯蒂歐' and (v.youtube_channel_id in ('UC9LF4J85zAG-6T-OjpcezOA', 'UCvglsaXuC9oHuDJZaZbs0AQ', 'UCXyAitTabBsoRclTn_Gq-eA', 'UChJo7dFfZ6mJXQgpXr3OxGg') or lower(v.twitch_channel_id) in ('moondogs_celestial')) and v.group_id is distinct from g.id;
-- 蜂沛創意行銷有限公司（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '蜂沛創意行銷有限公司' and (v.youtube_channel_id in ('UCRf7OJA3azS4RsGd_G96FUw') or lower(v.twitch_channel_id) in ('ruroroisme')) and v.group_id is distinct from g.id;
-- 雷雷研究社（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '雷雷研究社' and (v.youtube_channel_id in ('UCLkA2hjidxfHYPaKZ4UAr1A') or lower(v.twitch_channel_id) in ('zfg06')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 預見娛樂（29）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '預見娛樂' and (v.youtube_channel_id in ('UCF8icKLU4FGF8Ln-KlKakSg', 'UCZHa6yKnBnU34yRyvV3EXSA', 'UCbgr8vvzFLElzIxHDr2xV5w', 'UCChAHq4kdRZ0FJ1Jfjvr9cw', 'UC9NVe55fqFSC9iOZQJrlwrQ', 'UCvc-Xz6103-uVlIK-pWTXbA', 'UCbr-a2yffSZRjEbwtB1s2ow', 'UCE6fkoGPGOoWE6pYDalwLZQ', 'UCMhjWfFiyxVjNWBJpkDotcg', 'UCiJiU1LftLDm5tAR0X037Cw', 'UCIqsDMfhM3yeM9l6kNyEURg', 'UCVB6njJBYf-7Di03j8993AA', 'UCwwVVsJTvdeUK3sj4-qxgMQ', 'UC5_5l_AfpgJeYCxQnMnL-7A', 'UCh2ykSGKiJB3f-Y8w2LWplw', 'UCByO_vijBgRH1aWhQNYfw8Q', 'UCWEOI4TNvZQh-SDcdMrifyg', 'UCMwY4OKlMbwJYzT_wDAXs3w', 'UCjcXw7nWechEaodFEWtDk1Q', 'UCRCKrkjDimBhd-gVVojpUyQ', 'UCj76pRLEg2JHwDwJJXvZtSw', 'UC5bHZZ2df6_oFgOM_34_-aw', 'UCcT9BcGu92uvq_R1BKvw2fw', 'UCuPHlMEd0cR-tvAYPjGWVwQ', 'UCGGc-KmG4fxc8D03S-H0rbw', 'UC253VhyFxwgm4w1FC6-PoxQ', 'UC5R0yO6i_ApJf3AkcMFe7Tw', 'UCd4HPP11UbXLuvvhOjSABmw', 'UCYIzqbVP6FLZr4Kteo5gJrA') or lower(v.twitch_channel_id) in ('kannazukilubee', 'vaswawa0000', 'yuzukiririna', 'paroniie', 'cocor0_0303', 'p1lepe1el1', 'nekokaifuka', 'nyrfier', 'uchififi', 'meoao0a0', 'ekorru', 'sinniearis', 'barkbarkpomi', 'kai_alluria', 'l1karuz', 'mukuru_vtuber', 'himegimichika', 'yawnii_aelis', 'shurakukiriko', 'aelis_chamamatti', 'sh1uc0da', 'wakasaito', 'enominya_andi')) and v.group_id is distinct from g.id;
-- 鳩巢娛樂（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '鳩巢娛樂' and (v.youtube_channel_id in ('UCxmTsjQlfY3pFoO_eA3u9Fg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 夢月・Dream Moon（7）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '夢月・Dream Moon' and (v.youtube_channel_id in ('UCiFz1l0Mr9fn8s_r9ppzgKA', 'UCXdTJC1ykpY9jBBTmGHNL7w', 'UCunL3fz6XEe2tMRBFoNm0Vw', 'UC56ouOl41bgpq__cGkd9Sjw', 'UC0RElKxRGvlajXa1K70s67g', 'UC8dHXrDvmWBerJEK41rN3ww', 'UCttrUAhNubZ5FT-fGU38mig') or lower(v.twitch_channel_id) in ('karen___1101')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 夢想之都工作室（8）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '夢想之都工作室' and (v.youtube_channel_id in ('UCxAxBPUKQZzDGeI9xNSex7g', 'UChqdG0-OPJVP-z0T86Ro4Kg', 'UCtjJkNIBuWRzriF3Y7G2U4g', 'UC8_we5FUF9kHmOuL7qXPCug', 'UCg8GMU4s4RAR6uyO4zvvhHQ', 'UCHrLyXmg8iqJSYDPrChNIuw', 'UCSrHOlD09xhMfcZ8VQUX5jA', 'UC4MdpmqlZfxOkEUa3fD5r-A') or lower(v.twitch_channel_id) in ('hi_imcb', 'nowplayinggame')) and v.group_id is distinct from g.id;
-- 夢遊天使Myu（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '夢遊天使Myu' and (v.youtube_channel_id in ('UC5UUZ6-jkMocoHX7sJ6DlcA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 摸魚企鵝&廢人虎鯨（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '摸魚企鵝&廢人虎鯨' and (v.youtube_channel_id in ('UCx1HKw9IJ5U3lHRdEvggPag') or lower(v.twitch_channel_id) in ('moyu_moyu')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 漫遊宅創（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '漫遊宅創' and (v.youtube_channel_id in ('UCsR7-vtzQD-WFaZMg_wpafw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 熊熊文化工作坊（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '熊熊文化工作坊' and (v.youtube_channel_id in ('UCh7PqZbsCBVisbYP2_pJyIQ', 'UC5kqLvTsEhKBJ8X5RJBxd0w')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 綿牛喵星球（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '綿牛喵星球' and (v.youtube_channel_id in ('UCbqQOaT_aDmNQmCA0ssr9DA') or lower(v.twitch_channel_id) in ('nyana33')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 輕靈（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '輕靈' and (v.youtube_channel_id in ('UCIHt5N62td1Nmh1wS3FVHgg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 鳶尾之聲（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '鳶尾之聲' and (v.youtube_channel_id in ('UCUr1qVbSpppFQMfkqrNi3Nw', 'UCw8-P1EC5Mrlqud0zjz5jBQ') or lower(v.twitch_channel_id) in ('xiaosasa_')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 歐姆蛋工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '歐姆蛋工作室' and (v.youtube_channel_id in ('UCr0w_rtrzhXSe2VKv_Z0zCg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 箱箱The Box（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '箱箱The Box' and (v.youtube_channel_id in ('UC3ZTQ8VZVCpwLHjFKSFe5Uw', 'UCbh7KHPMgYGgpISdbF6l0Kw') or lower(v.twitch_channel_id) in ('theboxlily')) and v.group_id is distinct from g.id;
-- 橒界工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '橒界工作室' and (v.youtube_channel_id in ('UCDXCcWNex5du2kTcY2FGT2g') or lower(v.twitch_channel_id) in ('shirumu_')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 諦覓司（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '諦覓司' and (v.youtube_channel_id in ('UCOBsuL1u08iXAHTKJmsoMzw', 'UCfQnB5H8WXRqP8s0rF2zWow', 'UCvH1V84WtPU-tscycPdYulw', 'UCF1I4NeuaQ7_w8uC_F5lz_g')) and v.group_id is distinct from g.id;
-- 貓麻生產社（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '貓麻生產社' and (v.youtube_channel_id in ('UCF_2viuD5oxckwJcF9PNTVw') or lower(v.twitch_channel_id) in ('mao_bai')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 靛之森（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '靛之森' and (v.youtube_channel_id in ('UCFEd5V7VcxBPPcuMGpmvkQA', 'UCc_AgbCpwzzaG5TutxotrXg', 'UC3hzcs-PNqZPKNyxEnDTf9Q', 'UClLXLS4Cg91K06md98cFTJQ', 'UCH8a1AfaafkBDs2HnzU_f0Q') or lower(v.twitch_channel_id) in ('tobarana', 'tensi_vtb', 'yorurovtuber')) and v.group_id is distinct from g.id;
-- 靛堂（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '靛堂' and (v.youtube_channel_id in ('UCoNKCsX9tSxiuh9jznYxXfw', 'UCOyMk95cfU1aW_22NPYPhMg') or lower(v.twitch_channel_id) in ('galaxy_gingavt')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 斂財馬戲團（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '斂財馬戲團' and (v.youtube_channel_id in ('UCmjY9GWkKeCC48dOn9msptA') or lower(v.twitch_channel_id) in ('45mo')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 聯合行星（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '聯合行星' and (v.youtube_channel_id in ('UCLbr_G8oEH_o_qK194vg15A') or lower(v.twitch_channel_id) in ('nekomenemu')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 避難所（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '避難所' and (v.youtube_channel_id in ('UCNPYnnHe13aBNrpcYqlqHfg', 'UCru4KmPzZkyfrPpvWmfGc9Q') or lower(v.twitch_channel_id) in ('tatari_0305', 'phrynee_0125')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 鮭貓工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '鮭貓工作室' and (v.youtube_channel_id in ('UCP8f3laAxgn85pOVRSiM7qw') or lower(v.twitch_channel_id) in ('salmonneko')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 點一璃Glaçage（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '點一璃Glaçage' and (v.youtube_channel_id in ('UCMVLmB0BhFjSrnTCVGqMKZA', 'UCu-x0Gj5fV-Vicg5FgCBmkg', 'UC6IGQ50pqwV31v21maX3Avg', 'UCOwV2kGLgXrfJiPWBi3TNag') or lower(v.twitch_channel_id) in ('himari_glacage', 'lily_glacage', 'yolo_glacage', 'glacagedesign')) and v.group_id is distinct from g.id;
-- 織女星project（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '織女星project' and (v.youtube_channel_id in ('UCOJbhtkKyOOF63PsSMBhSpQ', 'UC72DNczNO1fr9bFjEoxL1uQ', 'UC6oqmpqc_WhQ6XrD4E28V_w', 'UCSMJW6WVDbOXvHWDQ45PrNA')) and v.group_id is distinct from g.id;
-- 鎮魂鐘（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '鎮魂鐘' and (v.youtube_channel_id in ('UCxn2fgZlQQnzjRFPu2zd2TA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 霧章（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '霧章' and (v.youtube_channel_id in ('UChSl6mgP58JtWBolur5iPhg', 'UCvsjiRvkAk-mN_nvPp5sQnQ', 'UCCD6Dd_RTLvbBuBeLJ-YbMw', 'UCpX8152ejt-6SVbdaHxkwPQ', 'UCQSE9_DoDty35JlkRn3TJPA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 寶寶睡工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '寶寶睡工作室' and (v.youtube_channel_id in ('UCzoYFDMtmJmA8XZeTdmfV7w')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 蘭德洛可工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '蘭德洛可工作室' and (v.youtube_channel_id in ('UCLkNXC6Yw83Cn_JP8yOutSg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- ACGlive（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'ACGlive' and (v.youtube_channel_id in ('UCDb47NT3QzoCiorDtK9C_qg', 'UCs-gepebQQqBMiNksqP9cYQ', 'UCZVkCI9NKz7q9JVW9oiTQJA', 'UCwrdKu9P0y7D2SXrCNbjRyQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Aepro（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Aepro' and (v.youtube_channel_id in ('UCPXHAr_EOCRH5Cea8lKyUpA', 'UCvNI6N7xHJYW19BVEqrbaRw') or lower(v.twitch_channel_id) in ('kas_aepro', 'haibara_aepro')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- AirLife（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'AirLife' and (v.youtube_channel_id in ('UCcE5DWjVsSgREfR8t0A5NYg', 'UCYzYYJ0xBdNSXm5I0BWEqJA', 'UCTrebXJdsxDHg41T0qAXD7A', 'UCOx3dxUckYJlsYFZGoRsfRQ') or lower(v.twitch_channel_id) in ('ruth_airlife')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- AsteriaLive（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'AsteriaLive' and (v.youtube_channel_id in ('UCofu6HsK6tZ76nEiW864Ubg') or lower(v.twitch_channel_id) in ('kurageelina', 'sevennightouo', 'asterialive0503')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- AURALIA Project（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'AURALIA Project' and (v.youtube_channel_id in ('UCePFQ2BNSjym3qjuqwfi1gQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- AuroraLive（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'AuroraLive' and (v.youtube_channel_id in ('UCUehf7oiKbmczOFFFE3quAA', 'UCymOeVRWRzjBrN_wfL7_xsg', 'UCrUBl2BaK0xpQE-xGf6dD3A', 'UCSWJ3xMIqzzGsiHH5qGDD2A', 'UCu5bJgRAWqNIel8P7isOkEg') or lower(v.twitch_channel_id) in ('nekoyarin', 'leinathalassa', 'finnirabbi')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Blossom Live（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Blossom Live' and (v.youtube_channel_id in ('UCgL6PS1vba90zrZW9xmiwng', 'UCSBG5KBsczK0mqDxGzZGJFg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- CACV（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'CACV' and (v.youtube_channel_id in ('UCtJ4exfMT-7kHs2VjhPio5A')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- CormaNewMedia（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'CormaNewMedia' and (v.youtube_channel_id in ('UCZhPqTpv1EzopO0jGIu8LCA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Craftslive Studio（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Craftslive Studio' and (v.youtube_channel_id in ('UCkdsPIgFOHthGxvvUV2ZiAw', 'UCrtVksLUol-weXm2Bo1CMnQ', 'UCe4_wEiPsrUbw4EeJeevjew') or lower(v.twitch_channel_id) in ('peiching_renatus')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- CY Future（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'CY Future' and (v.youtube_channel_id in ('UCu06qIis7ypubiMrH-3gRNg', 'UCesXwZ2QRcDknvm6gABU88g') or lower(v.twitch_channel_id) in ('samui_cyfuture', 'niepulu_cyfuture')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- DD箱（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'DD箱' and (v.youtube_channel_id in ('UCzRdoNzujVaLhY0q2nNEBZQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Destiny Live（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Destiny Live' and (v.youtube_channel_id in ('UC5IyFEQJlrl0m6HOlP9pyqQ', 'UCq_uAUTbH2gdKqEu6YINNng') or lower(v.twitch_channel_id) in ('liyin_vtuber')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- DetectLive（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'DetectLive' and (v.youtube_channel_id in ('UCICYD1HDTCgV5jLifTQ9olQ', 'UCdQoacfvJSel4ce42KIS9tA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Digital Dreamer（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Digital Dreamer' and (v.youtube_channel_id in ('UCIk0UmtmAnr9zrm2NuDmY2A', 'UC5WrnOlLRdzElFWVuyxT9EQ', 'UCXMjIRVmJq6HyQQq2_cNBeQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- EE Production（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'EE Production' and (v.youtube_channel_id in ('UCgBQ8Df7i0GoMo3RR1yv4gw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- ENDlive（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'ENDlive' and (v.youtube_channel_id in ('UCaKCNIJID8zaXOZYCxjW3Yg', 'UC_MgW5w1IEK9dFspmrHio_A', 'UC0l8tyYfC-SQIsnDWyEGLxA') or lower(v.twitch_channel_id) in ('tilliling0130')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Epoch Studio（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Epoch Studio' and (v.youtube_channel_id in ('UCBpgX2OSYuX6keQf-Wls1MA') or lower(v.twitch_channel_id) in ('yoru_yn')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- FahonLive（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'FahonLive' and (v.youtube_channel_id in ('UCoqZzJiVUMhmY8nMYOqa_Tw') or lower(v.twitch_channel_id) in ('fei_z', 'muling0606')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- FreedomLive（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'FreedomLive' and (lower(v.twitch_channel_id) in ('freedomlive_')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- FS Live（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'FS Live' and (v.youtube_channel_id in ('UClxPBf48KVoEOBFDGWgTJbQ', 'UCsJLczNUhaUtG3WjcjHTHnQ') or lower(v.twitch_channel_id) in ('amane_tainan', 'yukaiyunji')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- GOETHE STUDIO（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'GOETHE STUDIO' and (v.youtube_channel_id in ('UCVVjx9xPDSK0OQwyMmufh5g', 'UC2AXkyuOFWRC9OhsPvYhwvw', 'UCZzM-gyzcFgSuxWhPyFAWXg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Granto（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Granto' and (v.youtube_channel_id in ('UCgOFPDmRWGQsebwAAro7bYA', 'UCFwjRFgqHR6yfxP4K9h0vzg', 'UCXHHic43JjcMyWdgq5--QvQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- GS＠Virtual（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'GS＠Virtual' and (v.youtube_channel_id in ('UCtQZ25D0U7ZC8x2oiENSe5w', 'UCenm2lUIGEd5ZgZZPxEFbSw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- GuardianPB（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'GuardianPB' and (v.youtube_channel_id in ('UCVUftumdGBiCw9RlvrHIujA') or lower(v.twitch_channel_id) in ('suzukorei01')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- KAHO-FAMI（7）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'KAHO-FAMI' and (v.youtube_channel_id in ('UCJSBNjYCB1pu_t0FajsY17g', 'UChl9chAone90455JN7RHvWw', 'UCgYobGgRQSOS2NMbNAGKtuw', 'UCnAKol-fK2deV7QKfZY_ZyA', 'UC_wZTg59Tq6GqyPnFe_ICjQ', 'UC2oSg42GsQ7sdeNSUH2hpZg', 'UCs7h03kjQ2VtKcInbbJnsRw') or lower(v.twitch_channel_id) in ('aoihinamori', 'nekomaru_tw', 'boss_lv_1')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Kawas Project（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Kawas Project' and (v.youtube_channel_id in ('UClfZYRHXAcwRxkephu2lwmw', 'UCqSk6P_yjh8GcjnMcgKS4aQ') or lower(v.twitch_channel_id) in ('koharu0201')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Kiseki Plain（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Kiseki Plain' and (v.youtube_channel_id in ('UCNcjwLAaGwzjAslkVMlKf_A') or lower(v.twitch_channel_id) in ('shirosaki_hamu')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- L.M. Live（8）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'L.M. Live' and (v.youtube_channel_id in ('UCPLRqMnhjiIwo66XVdDCwgg', 'UCQjB6L29CR7HMETdQuBwV9w', 'UCtb_FKBFeIVodJo4uGA1pWQ', 'UCCC1t_ECvwp-xOIveA0gb2w', 'UCA3lAsXJhbXuh-IVoXY2jzw', 'UCSlqlIIjnH2TR2oAPTwZdPg', 'UC3X7ZZT7mkuVcYrrM2KI2AQ', 'UCp3HXVQE-tnGz6Zq__2DbUQ') or lower(v.twitch_channel_id) in ('regulusoaop', 'yakamitubioaop', 'nerumomo_ahymn', 'momogaluni_ahymn', 'agaberrila_ahymn', 'yarlekintar_ahymn', 'hydrorine_ahymn')) and v.group_id is distinct from g.id;
-- Lamplighter5（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Lamplighter5' and (v.youtube_channel_id in ('UCGLzVdlf-L_h1Usc1hrALcw', 'UC0ZBZHd4_jlQj_Xr_fbLPnw', 'UCmO8xJjIYrv6kGtGJF_nIMg') or lower(v.twitch_channel_id) in ('blue_kao', 'elinoralumiere')) and v.group_id is distinct from g.id;
-- Laniakea（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Laniakea' and (v.youtube_channel_id in ('UCFSdLIsJGRH2zNlQIbGiG6A') or lower(v.twitch_channel_id) in ('titu4_')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- LävëNdër（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'LävëNdër' and (v.youtube_channel_id in ('UCLtTrt1AoLjJiAWMPWWK4Vg') or lower(v.twitch_channel_id) in ('caroline0723333')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Leor Live（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Leor Live' and (v.youtube_channel_id in ('UCBm92r1K2FNl95YwxNBPO5Q', 'UCLsQCzQrKUU_0T7mMDbIDaw', 'UCbG6-mr2IwmvcwFM8sQtobQ', 'UC1NuOGhljtTP7p-dNRsntWw', 'UCpOgcFX03oV43HOPhhBzr4A') or lower(v.twitch_channel_id) in ('belmoru_nesh1', '46shizuru', 'nyaru_nesh1', 'cassandra_desu_', 'yueluoying_')) and v.group_id is distinct from g.id;
-- Limnos（14）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Limnos' and (v.youtube_channel_id in ('UCeeUqiYJFwJSuFkfxHKwASQ', 'UCvBGKwlGtLjl7n4qmUfHiIg', 'UCsO_Mq8ODjoCJLKUo8CHHSA', 'UCxsnprsgzFSj5lPguLei9_w', 'UCgGso0vVI2wfXHeXcxn1sZA', 'UC_IF2EVLSGHshLLiYm8wNGQ', 'UCML_XwKwggpBMpI2dOkN87g', 'UC8GhYDlrT-5fWV82l7jInaQ', 'UC4-gNLL6xnXLWMfwkae6OnQ', 'UCHUsJu-29R97rS8i13cl2wg', 'UCqkiy_D4xo0EEgouk6xhX7A', 'UCa6kUKEvrQG-35v3Om64TxA', 'UCJlJo_0kfJIXao3U9cbx6WQ', 'UCu8xnGNvyMARhjpga3VdQ5Q') or lower(v.twitch_channel_id) in ('chion_nk', 'hinokai1025', 'chero_limnos')) and v.group_id is distinct from g.id;
-- LUVMELIVE（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'LUVMELIVE' and (v.youtube_channel_id in ('UCUpt_SFPuyF85F6u-2MwyTg', 'UCG42y2go8Ls4EB2nuONp2qA', 'UCBCq1PMyTbGaQNfeVdhwsxw', 'UCyeDMcb6GXKqjlKN9l-x1LA') or lower(v.twitch_channel_id) in ('euniceua', 'fluvia_ua', 'morena_ua', 'ua929cs')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- M&B（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'M&B' and (v.youtube_channel_id in ('UCopx0mwVDRLrFRIlBRMjAtw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- MiaLive（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'MiaLive' and (v.youtube_channel_id in ('UC5J1uG7jbMdkEaDeXQTRDBQ', 'UCfJ6w5Up72thA7xxVIwCrFw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Miiracle Love（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Miiracle Love' and (v.youtube_channel_id in ('UC08IokqML-89ZzAufqTyWqw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Miragion Studio（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Miragion Studio' and (v.youtube_channel_id in ('UC3BSBOD67u9CUmpAakbhFkw', 'UC-Niey71pc-Y9JDxv1-CtWQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Mirolive（8）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Mirolive' and (v.youtube_channel_id in ('UCXe8hqIk_Yap31y7EOCMdzg', 'UCCo1oV47p2_gX7AgCMDisVg', 'UCjIciHMAc6Y-br3HU93AD1w', 'UCkTQ6gRCQPR_FbLXWakP6OA', 'UCzNRceCYIomBHAcdOJGCRAQ', 'UCHD87i7klQ_-up4bgPHglbQ', 'UCa7Cbx4buXLgY2d0Km19VPQ', 'UCLvywOIFoz0Cn2DjH20dvLQ') or lower(v.twitch_channel_id) in ('mirolivetabasuko88', 'hoshinokawanao', 'neo_hoshinokawa', 'miroazaria')) and v.group_id is distinct from g.id;
-- Missing失蹤人口（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Missing失蹤人口' and (v.youtube_channel_id in ('UCMW32vnl7U-dGQFQlmXoNBQ') or lower(v.twitch_channel_id) in ('psychemori_vtype')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- mlmlm（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'mlmlm' and (v.youtube_channel_id in ('UC7da2s8g7FXNsjiwEEGgYbg') or lower(v.twitch_channel_id) in ('hanesachikomo')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- MLNAM（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'MLNAM' and (v.youtube_channel_id in ('UCxm2qC7Z7cjDAd6yPyl-sKQ', 'UCUxIkkVP4EIIPhF8M1KRBjw') or lower(v.twitch_channel_id) in ('asa_ifrit')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Mojoy Live（12）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Mojoy Live' and (v.youtube_channel_id in ('UCI2yBA6FeEp2pJiRxAlbEdg', 'UCOh2vgSv4XH_TmVpGomA3og', 'UCTrpDaGwB2XhPyBcEKYEDqA', 'UCGGagpP10zRnQE8CaB3z1UA', 'UCag7xNl_gxpOJjhlSTLZwXA', 'UCjBHgPcH8fMK71bcoxiYKtA', 'UCizA-Cz_zHt66Fz1xhjggaw', 'UCFUdCSXJJOOgRtxMd_yXjbQ', 'UCZM5QNM9HYPIoe85fkDJH0A', 'UCafqYpa-I3coqjliCj01l7Q', 'UCOXoh_8h8qlGJrOyVy3MxPw', 'UCyZVBox6in7N5zTgzX0SVUQ')) and v.group_id is distinct from g.id;
-- Momiji Project（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Momiji Project' and (v.youtube_channel_id in ('UCVm9x9ZrDhpK9jgqkvNUzeA') or lower(v.twitch_channel_id) in ('akahimemomiji12')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- MOMOMO團（12）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'MOMOMO團' and (v.youtube_channel_id in ('UCKazkVudNQs8ZhwfXj_RNPw', 'UCtKyM4DA8CyCAm5LGsvUsag', 'UCQucf5TmsGZZPE-zpC9f5LA', 'UCb9Zg0yIbJEjgTQUK1LfpRg', 'UCApwCqmHCddqQkAObr-CqdQ', 'UCauImUa4IByz95-SxBDWZTQ', 'UC24VfLW6TODSoa36tot94CQ', 'UCB2Bq3iamct4YWmk6oQRDLw', 'UC6_38mg79k2C8HiHqOaf8rA', 'UCBZNHzMvze3twALODcCIBVg', 'UCZJ0FUCqMj_ppkd-sdN53zQ', 'UCERpy73Fxb6WBi04Mie677Q') or lower(v.twitch_channel_id) in ('ikusen_', 'ny8821205', 'vt_sasha', 'katsu_coco', 'momomokusarin', 'yuyumi_vt', 'ookamisakuya')) and v.group_id is distinct from g.id;
-- Mormitory Studio（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Mormitory Studio' and (v.youtube_channel_id in ('UCAvyumdOvIK8IwwujDtjJJA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- MorphusAI（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'MorphusAI' and (v.youtube_channel_id in ('UCig8jmxcpu8fwfpPWBITOeQ', 'UCh5-IkUSnk3pbTj7nJaxGXQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- MVO（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'MVO' and (v.youtube_channel_id in ('UC1UJoJ_o8woxTf-TT-8Uvhw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Neo Land（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Neo Land' and (v.youtube_channel_id in ('UCKfJcZMl6oNJC-vyehOZ68A', 'UCDh171h1fgaQINNeig9bClA') or lower(v.twitch_channel_id) in ('maruneko_retry')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- New Area Studio（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'New Area Studio' and (v.youtube_channel_id in ('UChCoj5T3sno8lRON0ecKBnw', 'UCzt67zwE4GUdRfZQdi4x8mw', 'UCLQp_1W2wD6Egnhf8QFpiKw', 'UCVqabOUG7EdgZLwMYFfIyRA', 'UCxgEil-1jQm-36kOvGWT_xQ') or lower(v.twitch_channel_id) in ('nanjoy0707', 'gelaier_black', 'laneez_twitch', 'lyme_cat_')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Ninth Games（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Ninth Games' and (v.youtube_channel_id in ('UC_opn5hW43xcsM-UNW2gfmA', 'UCG8XOFGCL0RgLCrf_cx_Jkg', 'UCLsAAOIw6ae9ltETE8QgqRQ', 'UCdBh5usysIgq6UtuT5ckHDw') or lower(v.twitch_channel_id) in ('linmeivtuber', 'komaru0611')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Nirvøc（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Nirvøc' and (v.youtube_channel_id in ('UCuInmB4GbxGfL9sN96IFscw', 'UCujmXAyQScJquuhg6HqxGPg') or lower(v.twitch_channel_id) in ('yidhra0727')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Nocturnal Jamboree（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Nocturnal Jamboree' and (v.youtube_channel_id in ('UC8AUsKC3d34gj2rLQGDGMEg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- 𝓝𝓸𝓬𝓽𝓾𝓻𝓷𝓮 𝄞（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = '𝓝𝓸𝓬𝓽𝓾𝓻𝓷𝓮 𝄞' and (v.youtube_channel_id in ('UCEY6aungPE-uTMNaAx4CaLg', 'UCvR44fWBQOp-o9melE5IBCA') or lower(v.twitch_channel_id) in ('hoshiluna1009')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- NURA studio（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'NURA studio' and (v.youtube_channel_id in ('UC4ki83Zp_kJtkCp0L3ymv-A')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- OC Studio（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'OC Studio' and (v.youtube_channel_id in ('UCvJ1mLz6Gz5XEjs_kOR7KjQ', 'UCOQERew_c6vml0V9Ii-E3GQ') or lower(v.twitch_channel_id) in ('komachitaniba', 'hiotoukei_ocs')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Opalight（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Opalight' and (v.youtube_channel_id in ('UCA7Cnm7lgoB9XwkD3GLdyDw', 'UCF5KFIlWNlr4lfH8iikQQpA') or lower(v.twitch_channel_id) in ('elmas_opalight')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- OriginS（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'OriginS' and (v.youtube_channel_id in ('UCSEvykHvN7KTTKeAANRqmQQ', 'UCXdMUjDyKP_kDCyHywkn4Ng')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Para≠dox（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Para≠dox' and (v.youtube_channel_id in ('UCseH1-bIicdKK9ySyiQxKcg', 'UCrXmMCh3709EGobRI4z0aIg')) and v.group_id is distinct from g.id;
-- PARADISE（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'PARADISE' and (v.youtube_channel_id in ('UChBXzThjjhFIY7S93xuzOng', 'UCBIqJvnDeNxeqtpK3ZvWbpg') or lower(v.twitch_channel_id) in ('nyfzqoq')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- ParalReturners（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'ParalReturners' and (v.youtube_channel_id in ('UCKH5aC_fRih812ZQaxeYfeQ', 'UCaCiUQD6kh6e5AbiRqkmzaA', 'UCTp_Ch1TqOjU_cPEDaSiLCQ', 'UCJv2rmTQnK8c9xo23pz2Qlg')) and v.group_id is distinct from g.id;
-- project: Fumetsu（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'project: Fumetsu' and (v.youtube_channel_id in ('UCYNcNTJMgQWNVxP47N_UOmg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Project.V.B（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Project.V.B' and (v.youtube_channel_id in ('UCnPcyhXbBXChL7NUlE_3VDQ', 'UCsfOggTlMU4bPxT67WeTkqA', 'UCCmf7ojWZ-wOJz3q19P2L-A')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Psycho Live（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Psycho Live' and (v.youtube_channel_id in ('UCHBrsRdgAR2Vo0SroozG9bg', 'UCYdreHEwTCcaMQ13hkK_dbw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- RaZerStar（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'RaZerStar' and (v.youtube_channel_id in ('UCF_Hh28RAiYTRm-NUyi-MqA') or lower(v.twitch_channel_id) in ('hoshikenremi')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- RECTALE（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'RECTALE' and (v.youtube_channel_id in ('UCbZcxNKrC0a6IZYBowvzAUg') or lower(v.twitch_channel_id) in ('makino_shiro')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- ReLive Project（16）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'ReLive Project' and (v.youtube_channel_id in ('UCx7GU8C3cr7vqp_SbS-8P-w', 'UCgVuzUu24q8KIDOjJcmCnIQ', 'UCrycDv1sYVGH5GK8XBTXABg', 'UCTzWMDbXbQAEJufwbHMP31Q', 'UCahjYNOw1qhSy4POSgqkRLQ', 'UCxPPx8b_88vYhqZNjU3zYWg', 'UCFx2E1YgFJGaFF-ekz0lwHg', 'UC__FHKqTFfn6Zg6xHHWgnCA', 'UCk-9bU7cMKBtaWWgCdHGmGA', 'UCh2qIv35rb4o7DKsdaXjUCw', 'UC6aT1wJaDkT5J4a_fD-n53w', 'UC9q-UvwDQEDe0011G5QWJeg', 'UCNiNvbqJX1xwLz7kkWGT7_g', 'UCZjRhT78El4L5hD4h_4wh1w', 'UC2Pc_OJt_N2UXB_wtw6cVYg', 'UCt6GeLIchuTWNHRp3OLP5tQ') or lower(v.twitch_channel_id) in ('grayda0105', 'noeyinrelive', 're_winnie', 'lupo_relive', 'octjun1006', 'chihiro_changtw', 'relive_sparky', '0_meemu_0', 'relive_bang')) and v.group_id is distinct from g.id;
-- RenewLive（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'RenewLive' and (v.youtube_channel_id in ('UCd8HRfH8S2TUJ47qkmYR9Kg', 'UC3yH88EaybiapvUaUbHEsMQ', 'UCcXo1Ch7aP-D6miwSWwWLVw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- RUE ARK（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'RUE ARK' and (v.youtube_channel_id in ('UCpSNRFPD7lmq7lskKnKSnYw', 'UC4YYXG8YAvZdMHNfYOHXuOw') or lower(v.twitch_channel_id) in ('kuzuki_yurina')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- S.O.S（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'S.O.S' and (v.youtube_channel_id in ('UChmOTCUI_NV3anrguQfdNOA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Sexy Monkey（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Sexy Monkey' and (v.youtube_channel_id in ('UCJ1HOBKAjaZD7pNZvsJ8e_A', 'UCfxQU1HIdtXpCHPr8UubICA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Small Shine工作室（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Small Shine工作室' and (v.youtube_channel_id in ('UCdI1iVcZCqJBuOJsWgRVXNg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- SpatialHigh（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'SpatialHigh' and (v.youtube_channel_id in ('UCxPm92Ha_cyS0VTp7ufyxsg', 'UCiNvjSXx542mp5h410fbMkA') or lower(v.twitch_channel_id) in ('tsunek1_3akana', 'leen_spatial')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- SPECIAL DEFENSE SQUAD（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'SPECIAL DEFENSE SQUAD' and (v.youtube_channel_id in ('UCXMy3JzgedAlbrlnDYytrhw', 'UCndeX-XRRvbDqX_MhArpLww', 'UC3yajKUVC3UuvWn6LBn7e6A', 'UCS1I_4qQEjLogN0XoiIpJEA')) and v.group_id is distinct from g.id;
-- SquareLive（8）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'SquareLive' and (v.youtube_channel_id in ('UCmyc8eVR3G9A7hjaHsLR6NQ', 'UC_UqaRNrLcaL4fp2IAPV0OQ', 'UCfZofhrZ4pxCESrcs5m5NJg', 'UC2yG-9ekUwTs8Q0yMSycMxA', 'UCW5O-tjdwofBwfispeMSPfw', 'UCyEdVShpd0J11uf1Tsz-Udw', 'UCI-b1GL4y_zoBoVozwmgrWQ', 'UCULLc5b5rzDNp9K-rtF8W5w') or lower(v.twitch_channel_id) in ('no15rescute', 'drlifesucks', 'haizmonstar', 'amrzsmonstar')) and v.group_id is distinct from g.id;
-- Stardust Live（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Stardust Live' and (v.youtube_channel_id in ('UCXnjmzvdDYLKuvMQRCLO6TQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- STARLIT ERROR（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'STARLIT ERROR' and (v.youtube_channel_id in ('UC5S2B63pT6CWmM_VwQyX9Qw', 'UCW0I1hmT7a2Qq6jvvOjkpeQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- StRine Office（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'StRine Office' and (v.youtube_channel_id in ('UC9vYD-h4jJnF37tOvyaf2Og')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- That Must Golive（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'That Must Golive' and (v.youtube_channel_id in ('UCLZ3JjS8x6J3q7Kao4fUMcA', 'UCnYcVDWxQXKBqM7oIRAx9Jg') or lower(v.twitch_channel_id) in ('twlonelyash')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- tomocora（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'tomocora' and (v.youtube_channel_id in ('UCQvKYWs-hQtfjPFZAKy3aRw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Trifling Light（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Trifling Light' and (v.youtube_channel_id in ('UCk-ua3DFHsUr8AL1TreZjiQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- TSA Studio（12）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'TSA Studio' and (v.youtube_channel_id in ('UCFZnIzx5T0tGl0DMQb8yPjg', 'UCMGLgmAkIkNlrs7WN3yXkHw', 'UC2D3bE_eERCvHzpBY3O9JZg', 'UCwAwjl2S1rj9UklLjrObNAw', 'UCNfeiTz_Hv_GbbcYvJgfolw', 'UCUsO0FsCeDRmLSOzw2LDXjQ', 'UCWesHdAkjtFXAHOZVYZ-ylw', 'UCJsFNXIMVP-uXasS_j5x-3g', 'UCT89KLUmbPxhgwVT2267Cjg', 'UCLET9ZfL26nCnCwLPnR9C7Q', 'UCKxoIwzAbaqZqsLcaLTmaPg', 'UCwYI5Bc5xASQXXei3g6gCbQ') or lower(v.twitch_channel_id) in ('pennyvtuber', 'resee0404', 'retime2088', 'rimorimo_vtuber', 'yamiya0501_vtuber', 'neon0414_vtuber', 'ink1221_vtuber', 'tenki_vtuber')) and v.group_id is distinct from g.id;
-- TSSVB（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'TSSVB' and (v.youtube_channel_id in ('UCVqua9yLAHaqB_kJdKdutxg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Twpaws（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Twpaws' and (lower(v.twitch_channel_id) in ('dontthebear')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Ubitus（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Ubitus' and (v.youtube_channel_id in ('UC8ldmN1z2EW_LnHFsJvlDsg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- UDUZ LIVE（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'UDUZ LIVE' and (v.youtube_channel_id in ('UCp8fha8Be4UQYTPPYR7s6jA') or lower(v.twitch_channel_id) in ('onigirinekowo')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- UMiLive（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'UMiLive' and (v.youtube_channel_id in ('UC0LNztG1Nh3q7KEoxgY5-7w', 'UCDpOEoJcnbCpOUgvCupQ4Aw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- VerseLink（6）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'VerseLink' and (v.youtube_channel_id in ('UCEKR9_crooN63lagUbx25RQ', 'UCz74f1swTzZAraJjZNyF-8g', 'UC7MZRwIl6zkfbT8MQMStpsA', 'UCf7F6ODbbdlBO0YAdD6Zxcg', 'UCbej9vh4Ksf9_Tru1Lm0z7w', 'UCK_XrZSztt5BKnYO7T070KA')) and v.group_id is distinct from g.id;
-- Victorialive（5）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Victorialive' and (v.youtube_channel_id in ('UCY1jb8Pj3SVbvOFo8EPnKSw', 'UCk6KD04FlPlaCbMFkfu9OBQ', 'UCHK1aFBPkZGhnTb8fLyDpQg', 'UCaaJd4kwFt69YBqrfn8aHbA', 'UCWo1jXCz_x4AMvlTXP1Um6A')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Virtual Dorm（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Virtual Dorm' and (v.youtube_channel_id in ('UCwcVH6I4m-wki2-pQNyzWiA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- VirtualLive（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'VirtualLive' and (v.youtube_channel_id in ('UCC0Xdh6IJnNBu9A5SnYCchA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- ViSIR（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'ViSIR' and (v.youtube_channel_id in ('UCeoTcQVD1sCu1b1MtE_blLg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Vlive Lab（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Vlive Lab' and (v.youtube_channel_id in ('UC_00EihWjuF2k1AJCaefOLw', 'UCT7ldrAzWNctHb_GPoZjwQw', 'UCPhQ6l-FSrYwAsb9jRPrYqw')) and v.group_id is distinct from g.id;
-- VOICEMITH（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'VOICEMITH' and (v.youtube_channel_id in ('UCYLYzg2BRjpDIf-damyjJRw', 'UCY_uSF4N-pMQVRONQihcW5Q', 'UCBg--1PwCyNYWfSpZCr41Kw')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- VoiX（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'VoiX' and (v.youtube_channel_id in ('UCAtYhckbtAft3JploaYQU8g', 'UCTSp-in7czGYl-rcy1zlNzA') or lower(v.twitch_channel_id) in ('koana_koala_', 'kaoru3214')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Vsupport（2）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Vsupport' and (v.youtube_channel_id in ('UCizVAYh1S9Rxq4y5jsZKVYw', 'UCY-e-w28EfNTZBvU32fgYWQ')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Wander²（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Wander²' and (v.youtube_channel_id in ('UCrMZCqZNmFIUDP5FPLJw4vg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Werhaus Music（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Werhaus Music' and (v.youtube_channel_id in ('UCkTfvQqiCDniJt2XZFEXAbg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Wings Live（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Wings Live' and (v.youtube_channel_id in ('UC9FEJkEneNCT1WfFl0LRHfA')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- World Weaver（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'World Weaver' and (v.youtube_channel_id in ('UCM1yCiwUEPhA4Zufj8tv_Eg')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- YahooTV（1）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'YahooTV' and (v.youtube_channel_id in ('UC6s0wLR0TZauzTVoGGw2r6g') or lower(v.twitch_channel_id) in ('hooniefriends')) and v.group_id is distinct from g.id;
-- YohoStage（4）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'YohoStage' and (v.youtube_channel_id in ('UCn4na6BUtn5AxJA3NM4uu8A', 'UCosys4rK1OiWe-YfBJPldJg', 'UCWOSC8LhLkKEkMhULUyHmZw', 'UCFtlE9whDK6dUPKuZxmxKFw') or lower(v.twitch_channel_id) in ('vibe_uni', 'vibe_ori', 'vibe_evi')) and v.group_id is distinct from g.id and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'));
-- Yololive（3）
update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = 'Yololive' and (v.youtube_channel_id in ('UCqEQmpRrFvytSElANdSLRUw', 'UCjSOYNtHGZ6LTt4Zo6wPmaA', 'UCZ9sOsn_0JGfPfMiXsNZorA') or lower(v.twitch_channel_id) in ('boniya0w0', 'usanoeru', 'winter4t2h')) and v.group_id is distinct from g.id;

-- ===== 4. 合作藝人：不掛團（目前掛在該團的解除）=====
update public.vtubers set group_id = null where youtube_channel_id = 'UCs5FNYPHeZz5f7N1BDExxfg' and group_id = (select id from public.vtuber_groups where name = '子午計畫');
update public.vtubers set group_id = null where name = 'KSP' and group_id = (select id from public.vtuber_groups where name = '子午計畫');
update public.vtubers set group_id = null where youtube_channel_id = 'UC0u_-3zgLkSYpQOxlBi-5Ng' and group_id = (select id from public.vtuber_groups where name = 'SquareLive');
update public.vtubers set group_id = null where youtube_channel_id = 'UCDd6sns5MmQTfCbfKjtHxgQ' and group_id = (select id from public.vtuber_groups where name = '弓炬計畫');
update public.vtubers set group_id = null where youtube_channel_id = 'UCTSjBX4G6niqsic4JT9ZVDQ' and group_id = (select id from public.vtuber_groups where name = '弓炬計畫');
update public.vtubers set group_id = null where youtube_channel_id = 'UC_dwiOGE_uWNYtbyFg1PNeg' and group_id = (select id from public.vtuber_groups where name = '恋Vaichu');
update public.vtubers set group_id = null where youtube_channel_id = 'UC_IgAilU3h-oNWWMg2AcGlA' and group_id = (select id from public.vtuber_groups where name = '恋Vaichu');

-- ===== 5. 狀態修正（有媒體或官方出處）=====
-- 史黛菈 埃蕾諾亞：Limnos 公告 2026-07-07 畢業
update public.vtubers set activity = 'graduate' where youtube_channel_id = 'UC_IF2EVLSGHshLLiYm8wNGQ' and activity is distinct from 'graduate';
-- 夏蘿：Limnos 公告 2025-12-31 畢業
update public.vtubers set activity = 'graduate' where youtube_channel_id = 'UCa6kUKEvrQG-35v3Om64TxA' and activity is distinct from 'graduate';

-- ===== 6. 成員數校正（之後由 trigger vtubers_group_member_count 維護）=====
update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0)
where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);
