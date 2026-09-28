-- 補上 vtubers.group_id（先前 import 漏掉）
-- 來源：docs/TaiwanVTuberTrackingDataJson-master/api/v2/all/groups/<group>/vtubers.json
-- 配對方式：vtuber.name 完全相符；不相符的不變動

UPDATE public.vtubers SET group_id = (SELECT id FROM public.vtuber_groups WHERE name = 'Limnos') WHERE name IN ('希翁','黑銀夜烏','凝川眠','光逸 幸','繆・索緹絲','史黛菈 埃蕾諾亞','火野貝','奇露琪露','汐海黑兔','庫路路','艾提','夏蘿','克蕾','Limnos(官方頻道)') AND group_id IS NULL;
UPDATE public.vtubers SET group_id = (SELECT id FROM public.vtuber_groups WHERE name = 'Mirolive') WHERE name IN ('塔芭絲可','星之川倷緒','波奇卡德霍','星之川涅緒','冬華凜','埃爾庫涅','梅莉帕可斯','阿莎莉亞') AND group_id IS NULL;
UPDATE public.vtubers SET group_id = (SELECT id FROM public.vtuber_groups WHERE name = 'SquareLive') WHERE name IN ('厄倫蒂兒','茸茸鼠','涅默','熙歌','兔姬','埃穆亞','露恰露恰','幻月','十五號','歐妲','平平子','歐貝爾','冰霧','賽特珞','白白虹','厭世醫師阿萬','格萊伊','艾斯珀達','雲隙光','穆恩佐','海唧','阿爾姿','拉斐利婭','安特羅迦') AND group_id IS NULL;
UPDATE public.vtubers SET group_id = (SELECT id FROM public.vtuber_groups WHERE name = '子午計畫') WHERE name IN ('浠Mizuki','汐Seki','煌Kirali','橙Yuzumi','澪Rei','玥Itsuki','祈Iruni','響Hibiki','朔Sakuro','実Hitomi','雪Koyuki','煦Hiyori','幸Sachi','玖玖巴','宵Yoruno','朧Oboro','子午計畫(官方頻道)') AND group_id IS NULL;
UPDATE public.vtubers SET group_id = (SELECT id FROM public.vtuber_groups WHERE name = '箱箱The Box') WHERE name IN ('森森鈴蘭','瑪格麗特 · 諾爾絲') AND group_id IS NULL;
UPDATE public.vtubers SET group_id = (SELECT id FROM public.vtuber_groups WHERE name = '雲際線工作室') WHERE name IN ('悠白','李李鈴蘭','角蓮','周默','瑪格麗特．溫特斯','神稻櫻火','雲際線工作室(官方頻道)','妮歐') AND group_id IS NULL;
UPDATE public.vtubers SET group_id = (SELECT id FROM public.vtuber_groups WHERE name = '預見娛樂') WHERE name IN ('懶貓子','神無月鹿比','瓦西瓦瓦','結月莉莉奈','帕蘿妮','心','珮蕾','量產型猫飼步歌貳貳機','涅爾菲','羽芝扉扉','梅奧奧','希洛萊昂','依可露','希妮·亞里絲','百百波美','魁','鯨諾','利卡洛斯','穆克蕗','姬城三千華','睏睏幽昵','酒樂霧子','艾琳妮雅','茶帽瑪緹','詩雨蔻達','若櫻依兔','崎塔','克克米伊','諾恪里','愛喵Andi') AND group_id IS NULL;

-- 同步 vtuber_groups.member_count 為實際對應 vtubers 數量
UPDATE public.vtuber_groups vg
SET member_count = (SELECT COUNT(*) FROM public.vtubers v WHERE v.group_id = vg.id),
    updated_at = now();
