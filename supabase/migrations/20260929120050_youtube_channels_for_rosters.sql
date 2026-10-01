-- 正式站 vtubers.youtube_channel_id 有外鍵指向 youtube_channels(channel_id)（本地 schema 缺這條，所以本地套用時沒發現）。
-- 名冊、合作、hololive 等資料 migration（20260929120100 起）會把 vtubers 指到這 30 個正式站 youtube_channels 還沒有的頻道，
-- 2026-10-02 套正式站時 20260929120100 因此失敗（23503）。本檔先補這些頻道的快取列；頻道名先用名冊上的 VTuber 名稱，
-- 真正的標題、頭像、訂閱數由 scripts/enrich-youtube-channels.mjs（Data API）之後補。已存在就不動。
-- 清單：正式站唯讀查詢「資料 migration 引用、但 youtube_channels 沒有的 UC id」，排除只出現在頭像網址或 where 條件裡的 3 個。
--
-- 回滾：delete from public.youtube_channels where channel_id in (下列 id) and not exists (select 1 from public.vtubers v where v.youtube_channel_id = channel_id);

insert into public.youtube_channels (channel_id, channel_title) values
    ('UC_iAz2iAlZ338H_xRflJeWw', '佩爾戴斯'),
    ('UC_soGpcb7SORsk5yzHLMdTQ', '神稻櫻火'),
    ('UC1CfXB_kRs3C-zaeTG3oGyg', '赤井はあと'),
    ('UC1opHUrw8rvnsadT-iGp7Cg', '湊あくあ'),
    ('UC2aD3SGRZgUsIP-gJ0BkeYg', '卡嘎咪'),
    ('UC30deyj1rntXPF0l9T2xhnQ', '利歐·奧崙Rio Oren'),
    ('UC3n5uGu18FoCy23ggWWp8tA', 'Nanashi Mumei'),
    ('UC3xQCiEPSkco54WhuiDcngw', 'YOSHIKA⁂'),
    ('UC93733Iz1fQKLJmUeiDuUmQ', 'Yuki 白昭雪'),
    ('UC9DljBnS6LkeM08llrd_mJQ', '梓凜'),
    ('UCD8HOxPs4Xvsm8H0ZxXGiBw', '夜空メル'),
    ('UCgZuwn-O7Szh9cAgHqJ6vjw', '魔乃アロエ'),
    ('UCIBY1ollUsauvVi4hW4cumw', '沙花叉クロヱ'),
    ('UCl_gCybOJRIgOXw6Qb4qJzQ', '潤羽るしあ'),
    ('UCMGfV7TVTmHhEErVJg1oHBQ', '火威青'),
    ('UCN6XPafOEox1c8KFvs3BfNQ', '莉莉·埃絲忒'),
    ('UCO_aKKYxn4tvrqPjcTzZ6EQ', 'Ceres Fauna'),
    ('UCoSrY_IQQVpmIRZ9Xf-y93g', 'Gawr Gura'),
    ('UCqgXGPKOaLGGtHPPuAB7qwQ', '茱莉葉塔'),
    ('UCS9uQI-jC3DE0L4IpXyvr6w', '桐生ココ'),
    ('UCSjQDxud2HkAO2DVD3lwxmw', '百灯キョーコ'),
    ('UCsUj0dszADCGbF3gNrQEuSQ', 'Tsukumo Sana'),
    ('UCuI_opAVX6qbxZY-a-AxFuQ', '虎金妃笑虎'),
    ('UCULLc5b5rzDNp9K-rtF8W5w', '阿爾姿'),
    ('UCvibu2DQGJbvBb6DDz25EuA', '京洛'),
    ('UCW5O-tjdwofBwfispeMSPfw', '歐貝爾'),
    ('UCXTpFs_3PqI41qX2d9tL2Rw', '紫咲シオン'),
    ('UCyl1z3jo3XHR1riLFKG5UAg', 'Watson Amelia'),
    ('UCz201HxiHn8cE-QU8pIZj_g', '米果'),
    ('UCZlDXzGoo7d44bwdNObFacg', '天音かなた')
on conflict (channel_id) do nothing;
