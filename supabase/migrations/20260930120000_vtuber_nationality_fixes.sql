-- 地區（nationality）嚴格檢查後的修正。由 scripts/build-nationality-fixes.mjs 產生，不要手改。
-- 地區＝社群歸屬（本人或所屬公司自稱）；篩檢 scripts/audit-nationality.mjs → 逐筆查證 → 證據存 scripts/data/tw-nationality-audit-2026-09.json
-- 只收證據類型為本人自稱（self）或所屬公司（agency）的改動。
-- **須單一交易套用**（apply_migration 或 psql -1）；各段敘述「已是目標值就跳過」，整份重新套用前先依下方回滾並 drop 備份表。
-- 回滾（依第 0 段備份；只還原目前仍是本檔新值的列，之後被別人改過的不動）：
--   update public.vtubers v set nationality = b.nationality from backup.nationality_20260930 b where b.id = v.id and v.nationality = b.new_value;
--   drop table backup.nationality_20260930;

-- ===== 0. 套用前備份（回滾用；上次的備份還在就停）=====
do $$ begin if to_regclass('backup.nationality_20260930') is not null then raise exception '已有 backup.nationality_20260930：確認後 drop 再重新套用'; end if; end $$;
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table backup.nationality_20260930 (id uuid primary key, nationality text not null, new_value text not null);
insert into backup.nationality_20260930 (id, nationality, new_value) values ('17f831ef-d258-4b0b-b5dc-dd4893a2223d'::uuid, 'HK', 'TW'), ('06e66ca7-1c67-405f-b0a1-89eade6431b2'::uuid, 'JP', 'TW'), ('442ffa79-efc8-430a-ba90-e05b7844841b'::uuid, 'JP', 'TW'), ('cf5824a8-58da-4404-a388-4fe9028fbd26'::uuid, 'OTHER', 'TW'), ('99253947-ba2a-47f8-8737-740c34455856'::uuid, 'TW', 'MY'), ('198e4817-a541-4baa-b60d-38177c7e869a'::uuid, 'OTHER', 'TW'), ('3f66be47-0ead-470b-94a2-ff932569ae10'::uuid, 'TW', 'MY'), ('874e21d1-83d7-4d44-b1dd-9baed60e7d2e'::uuid, 'TW', 'HK'), ('baa3b28d-1ddc-4056-b812-5aab19721e3a'::uuid, 'OTHER', 'TW'), ('2b612c0c-6483-4c7d-9939-65e38d67a1c6'::uuid, 'OTHER', 'TW'), ('768dfee2-fa3d-4021-91ca-0863e59575ef'::uuid, 'OTHER', 'TW'), ('7b14febb-bfaf-4cd1-8571-abc07fc950d0'::uuid, 'MY', 'TW'), ('d4a5ab04-8535-4ab3-b333-448d19ff6ccf'::uuid, 'OTHER', 'TW'), ('8000e52c-708b-40c1-a6c3-1828abd1c404'::uuid, 'TW', 'HK'), ('5d03b328-ca57-4e1f-87b0-9de8a18344af'::uuid, 'OTHER', 'TW'), ('61922a53-98d7-4136-bf1e-d12b40b3336f'::uuid, 'OTHER', 'TW'), ('dd3d147f-e122-4cbd-8454-a78f311e902c'::uuid, 'MY', 'TW'), ('ce102e40-6536-4885-810e-292fad5de6c0'::uuid, 'OTHER', 'TW'), ('dea6000a-1e32-46e8-8a71-2082c1668720'::uuid, 'OTHER', 'TW'), ('b47fcaf1-d93c-42e3-8a99-a6facbf49db8'::uuid, 'OTHER', 'TW'), ('e85468e9-f33c-45b6-a847-01c22c3292e5'::uuid, 'OTHER', 'TW');

-- ===== 1. 地區修正（每筆附證據；只在目前仍是舊值時改）=====
-- 猫崎ライミ：HK → TW（self）｜YouTube 簡介自述「是香港人但為了練國語口說在當台V」，社群歸屬自稱台V（周邊賣場亦為台灣地區綠界）｜https://www.youtube.com/channel/UCnn3Zn74wroyx7qHr911IyA/about
update public.vtubers set nationality = 'TW' where id = '17f831ef-d258-4b0b-b5dc-dd4893a2223d' and nationality = 'HK';
-- 懶貓子：JP → TW（agency）｜預見娛樂官網把懶貓子列為旗下藝人（獨立一類）；預見娛樂為查證過的台灣企業勢；鏡週刊亦稱其為台灣VTuber｜https://www.mirrormedia.mg/story/20240912insight004
update public.vtubers set nationality = 'TW' where id = '06e66ca7-1c67-405f-b0a1-89eade6431b2' and nationality = 'JP';
-- 加百利 珈咘：JP → TW（self）｜自家直播標題「【日籍台V】」與 Shorts「#日籍台v」：日籍但自稱台V，內容面向台灣觀眾，yt_country=TW｜https://www.youtube.com/channel/UCCHsCWNTcGJ8Jml_oZ6nG2Q/streams
update public.vtubers set nationality = 'TW' where id = '442ffa79-efc8-430a-ba90-e05b7844841b' and nationality = 'JP';
-- 莫米亞Momia：OTHER → TW（self）｜自家 Shorts 標籤「#直播歌切 #vtuber #歌枠 #台v」；簡介僅列語言｜https://www.youtube.com/channel/UCjeNaWFARMkfeE40RuNsDXw/shorts
update public.vtubers set nationality = 'TW' where id = 'cf5824a8-58da-4404-a388-4fe9028fbd26' and nationality = 'OTHER';
-- 曉明：TW → MY（self）｜頻道簡介「我是一位來自馬來西亞的剪輯師兼Vtuber」｜https://www.youtube.com/channel/UCkPcYa6Kfa7cg_YdtRRKpog/about
update public.vtubers set nationality = 'MY' where id = '99253947-ba2a-47f8-8737-740c34455856' and nationality = 'TW';
-- 浠Mizuki：OTHER → TW（agency）｜子午計畫所屬（子午計畫為查證過的台灣企業勢，公司在桃園）；X 簡介另有 🇹🇼｜https://x.com/MizukiVtuberTW
update public.vtubers set nationality = 'TW' where id = '198e4817-a541-4baa-b60d-38177c7e869a' and nationality = 'OTHER';
-- 慕晴MuQing：TW → MY（self）｜X 簡介「Malaysian Vtuber」、位置 Malaysia；Twitch 簡介「Malaysian Vtuber… 8 PM GMT+8 (Malaysia Time)」｜https://x.com/Muqing_Official
update public.vtubers set nationality = 'MY' where id = '3f66be47-0ead-470b-94a2-ff932569ae10' and nationality = 'TW';
-- 貓耳 Nekomix：TW → HK（self）｜YouTube 簡介「個人勢 | 粵/國/EN👌日🤏 | HKVtuber」、X 簡介 #HKVtuber｜https://www.youtube.com/channel/UCJyUJuz8L-mu1Ted8W-QR_Q
update public.vtubers set nationality = 'HK' where id = '874e21d1-83d7-4d44-b1dd-9baed60e7d2e' and nationality = 'TW';
-- 帕可·帕米：OTHER → TW（self）｜YouTube 簡介 hashtag「#台灣Vtuber」（X 位置「地球加拿大分部」、yt_country=CA 僅為居住地）｜https://www.youtube.com/channel/UCYH8b76CrBUEfS7So_Zv09g
update public.vtubers set nationality = 'TW' where id = 'baa3b28d-1ddc-4056-b812-5aab19721e3a' and nationality = 'OTHER';
-- 椎奈唯：OTHER → TW（self）｜Twitch 簡介開頭「台灣Vtuber」｜https://www.twitch.tv/shiina_yui
update public.vtubers set nationality = 'TW' where id = '2b612c0c-6483-4c7d-9939-65e38d67a1c6' and nationality = 'OTHER';
-- 咬錢竜エリカ：OTHER → TW（self）｜直播標題固定標「｜Vtuber｜台V」｜https://www.youtube.com/channel/UCpgs_7QydwfV3U6EdfwJU5w
update public.vtubers set nationality = 'TW' where id = '768dfee2-fa3d-4021-91ca-0863e59575ef' and nationality = 'OTHER';
-- 露娜莉亞·懷特：MY → TW（self）｜頻道與 Twitch 簡介明寫「個人勢馬籍台v」「住台馬來西亞天使龍」，標題常標 #馬籍台v；社群歸屬為台V｜https://www.youtube.com/channel/UC3F-zmSUoygdqf4WjhDWYRQ
update public.vtubers set nationality = 'TW' where id = '7b14febb-bfaf-4cd1-8571-abc07fc950d0' and nationality = 'MY';
-- 麵茶白白：OTHER → TW（self）｜直播標題固定標 #台V #台灣vtuber，斗內用綠界 ECPay｜https://www.youtube.com/channel/UCRW9XFwZBGVPjRRD4oEcdUw
update public.vtubers set nationality = 'TW' where id = 'd4a5ab04-8535-4ab3-b333-448d19ff6ccf' and nationality = 'OTHER';
-- 七夜小綠：TW → HK（self）｜X 簡介「這裡是🇭🇰Vtuber~七夜小綠」「#HKVtuber」；影片說明 #hkvtuber｜https://x.com/Midori_Nanaya
update public.vtubers set nationality = 'HK' where id = '8000e52c-708b-40c1-a6c3-1828abd1c404' and nationality = 'TW';
-- 栗塔Ritta：OTHER → TW（self）｜Shorts 標題「妳是要打什麼出來?? #台v #vtuber #shorts」；多支影片說明 #台v｜https://www.youtube.com/shorts/GFeu1lC625U
update public.vtubers set nationality = 'TW' where id = '5d03b328-ca57-4e1f-87b0-9de8a18344af' and nationality = 'OTHER';
-- 基利斯：OTHER → TW（self）｜自家影片標題「#yapyap #台灣vtuber #基利斯吸血中 #vtuber」（多支），yt_country=TW 亦一致｜https://www.youtube.com/feeds/videos.xml?channel_id=UCkJMzg5-cAMeXsrHPSJKL2w
update public.vtubers set nationality = 'TW' where id = '61922a53-98d7-4136-bf1e-d12b40b3336f' and nationality = 'OTHER';
-- 阿煙：MY → TW（self）｜自家影片標題「#台v #vtuber #圖奇」「#台v #星穹铁道」｜https://www.youtube.com/feeds/videos.xml?channel_id=UCRN1HvekTOo7X-d-DYf64Gg
update public.vtubers set nationality = 'TW' where id = 'dd3d147f-e122-4cbd-8454-a78f311e902c' and nationality = 'MY';
-- 沉沒壽司：OTHER → TW（self）｜頻道簡介「I am Sushi sing the Sink-able a Taiwan part-time Vtuber」｜https://www.youtube.com/channel/UCdsVMkt5YAlc2PAKxDDvzgA/about
update public.vtubers set nationality = 'TW' where id = 'ce102e40-6536-4885-810e-292fad5de6c0' and nationality = 'OTHER';
-- 月璃•克勞狄烏斯：OTHER → TW（self）｜X（@yueliclaudius，頻道連結）簡介「台灣個人勢Vtuber」｜https://x.com/yueliclaudius
update public.vtubers set nationality = 'TW' where id = 'dea6000a-1e32-46e8-8a71-2082c1668720' and nationality = 'OTHER';
-- 芙耶拉：OTHER → TW（agency）｜頻道簡介「SparkleUniverse所屬…工商/合作聯繫：sct@sparklecloud.co」；X「【企業勢 AI VTuber】」；爍雲科技官網列「芙耶拉・公司公關大使」「旗下藝人」，地址「臺北市內湖區內湖路1段250號12樓」a｜https://www.sparklecloud.co/
update public.vtubers set nationality = 'TW' where id = 'b47fcaf1-d93c-42e3-8a99-a6facbf49db8' and nationality = 'OTHER';
-- 菓菓：OTHER → TW（self）｜影片標題「【楓之谷經典服】來坐牢啦 好窮  #台灣vtuber #台v」｜https://www.youtube.com/feeds/videos.xml?channel_id=UCzQsBZUJBI9JIOZYnDRyTUA
update public.vtubers set nationality = 'TW' where id = 'e85468e9-f33c-45b6-a847-01c22c3292e5' and nationality = 'OTHER';
