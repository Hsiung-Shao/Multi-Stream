const account = {
    'pageTitle': '帳號設定',
    'seoTitle': '帳號設定 | MultiStream Hub',
    'seoDesc': '管理你的登入方式與帳號資料。',
    'signInRequired': '此頁面需登入後才能存取',
    'menuLabel': '帳號設定',

    'overview.displayName': '目前顯示名稱',
    'overview.trustLevel': '帳號等級',

    'displayName.title': '顯示名稱',
    'displayName.description': '用於頁面與投稿者署名顯示。長度 {{min}}–{{max}} 字。',
    'displayName.placeholder': '輸入顯示名稱',
    'displayName.save': '儲存',
    'displayName.saved': '已儲存',
    'displayName.error.required': '名稱必填',
    'displayName.error.tooShort': '名稱至少 2 字',
    'displayName.error.tooLong': '名稱最多 30 字',
    'displayName.error.allDigits': '名稱不可全為數字',
    'displayName.error.forbiddenChar': '名稱含不允許的隱形或控制字元',
    'displayName.error.rateLimit': '本日修改次數已達上限，請明天再試',
    'displayName.error.generic': '更新失敗，請稍後再試',

    'identities.title': '登入方式',
    'identities.description': '用任一連結的 OAuth 帳號都能登入此帳號。至少需保留一個；解除最後一個將永久刪除帳號。',
    'identities.linkedAt': '已連結',
    'identities.notLinked': '未連結',
    'identities.link': '連結',
    'identities.unlink': '解除',
    'identities.deleteAccount': '解除並刪除帳號',
    'identities.errorTitle': '操作失敗',

    'unlink.title': '解除連結',
    'unlink.description': '確定要解除 {{provider}} 嗎？解除後將無法用 {{provider}} 登入此帳號。',
    'unlink.remainingHint': '解除後仍有 {{count}} 個其他登入方式可使用。',
    'unlink.confirm': '解除',

    'deleteAccount.title': '永久刪除帳號',
    'deleteAccount.description': '此操作會永久刪除你的帳號與所有資料（收藏、投稿、活動）。資料無法復原。',
    'deleteAccount.warningList': '將被刪除：所有 OAuth 連結、收藏分類與標籤、你的投稿與活動、你的個人資料',
    'deleteAccount.acknowledge': '我了解這是不可逆操作，且我的所有資料將被永久刪除',
    'deleteAccount.confirmNameLabel': '為了確認，請輸入你的顯示名稱：',
    'deleteAccount.confirm': '永久刪除',
    'deleteAccount.error': '刪除失敗，請稍後再試',
};

export default account;
