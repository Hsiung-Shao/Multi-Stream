const account = {
    'pageTitle': 'Account Settings',
    'seoTitle': 'Account Settings | MultiStream Hub',
    'seoDesc': 'Manage your sign-in methods and account data.',
    'signInRequired': 'You must be signed in to access this page',
    'menuLabel': 'Account settings',

    'overview.displayName': 'Display name',
    'overview.trustLevel': 'Account level',

    'displayName.title': 'Display name',
    'displayName.description': 'Used for page display and contributor attribution. Length {{min}}–{{max}}.',
    'displayName.placeholder': 'Enter display name',
    'displayName.save': 'Save',
    'displayName.saved': 'Saved',
    'displayName.error.required': 'Required',
    'displayName.error.tooShort': 'Must be at least 2 characters',
    'displayName.error.tooLong': 'Must be at most 30 characters',
    'displayName.error.allDigits': 'Cannot be all digits',
    'displayName.error.forbiddenChar': 'Contains invisible or control characters',
    'displayName.error.rateLimit': 'Daily rename limit reached, try again tomorrow',
    'displayName.error.generic': 'Update failed, please try again later',

    'identities.title': 'Sign-in methods',
    'identities.description': 'Any linked OAuth account can be used to sign in. Keep at least one. Removing the last one will permanently delete your account.',
    'identities.linkedAt': 'Linked',
    'identities.notLinked': 'Not linked',
    'identities.link': 'Link',
    'identities.unlink': 'Unlink',
    'identities.deleteAccount': 'Unlink & delete account',
    'identities.errorTitle': 'Action failed',

    'unlink.title': 'Unlink',
    'unlink.description': 'Unlink {{provider}}? You will no longer be able to sign in via {{provider}}.',
    'unlink.remainingHint': 'You will still have {{count}} other sign-in method(s) available.',
    'unlink.confirm': 'Unlink',

    'deleteAccount.title': 'Delete account permanently',
    'deleteAccount.description': 'This will permanently delete your account and all data (favorites, contributions, events). This cannot be undone.',
    'deleteAccount.warningList': 'Will be removed: all OAuth links, favorite categories and tags, your contributions and events, your profile.',
    'deleteAccount.acknowledge': 'I understand this is irreversible and all my data will be permanently deleted',
    'deleteAccount.confirmNameLabel': 'To confirm, type your display name:',
    'deleteAccount.confirm': 'Delete permanently',
    'deleteAccount.error': 'Delete failed, please try again later',
};

export default account;
