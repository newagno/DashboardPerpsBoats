const translations = {
    en: {
        'logo_text': 'Perpetual Trading Dashboard',
        'init_deposit': '01 // INITIAL_DEPOSIT',
        'pnl': '02 // PNL',
        'mean_win_rate': '03 // MEAN_WIN_RATE',
        'total_volume': '04 // TOTAL_VOLUME',
        'point_value': '05 // $/POINT',
        'active_streams': 'ACTIVE / TELEMETRY_STREAMS',
        'no_exchange_configured': 'NO ACTIVE EXCHANGE CONFIGURED. CLICK "ADD_EXCHANGE" TO INITIALIZE.',
        'security_notice': '<strong>SECURITY NOTICE:</strong> We do not ask for or store your private keys. Authorization is handled via secure EIP-712 Web3 signatures and server-side stateful cookies.',
        'btn_add_exchange': '[ + ] ADD_EXCHANGE',
        'btn_connect': 'Connect & Authenticate',
        'btn_disconnect': 'Disconnect',
        
        'modal_title': 'MODULE / LINK_EXCHANGE',
        'modal_close': 'ESC',
        'select_exchange': 'Select Exchange Platform',
        'wallet_address': 'Wallet Address',
        'wallet_placeholder': '0x...',
        'api_key_label': 'Tab-Only Read-Only API Key',
        'api_key_placeholder': 'Paste your API key here',
        'api_key_desc': 'Extended requires a Read-Only API Key. This key is <strong>never stored</strong> in localStorage or the server. Persists only in tab memory.',
        'label_label': 'Label',
        'label_placeholder': 'e.g. Nado Main, Trading Wallet',
        'btn_cancel': 'Cancel',
        'btn_submit_add': 'Add Exchange',
        
        'err_invalid_address': '⚠ Invalid address — must be 42 chars starting with 0x',
        'err_no_address': '⚠ No address provided and no wallet connected',
        'err_already_added': '⚠ This wallet is already added for this exchange',
        'err_please_enter': '⚠ Please enter a wallet address',
        
        'syncing': 'SYNCHRONIZING EXCHANGE ACCOUNTS...',
        'no_exchanges': 'NO EXCHANGES ADDED.',
        'refreshing': 'Refreshing...',
        'failed_sync': 'Failed to sync',
        
        'card_init_deposit': '01 // INIT_DEPOSIT',
        'card_act_deposit': '02 // ACT_DEPOSIT',
        'card_volume': '03 // VOLUME',
        'card_points': '04 // POINTS',
        'card_rank': '05 // RANK',
        'card_pnl': '06 // PNL',
        'card_win_rate': '07 // WIN_RATE',
        'card_point_value': '08 // $/POINT',
        
        'easter_success': '🔓 ACCESS_GRANTED',
        'easter_title': 'DECLASSIFIED_INTEL',
        'easter_desc': 'UNIT ID RECOGNIZED. SUBSCRIPTION EXTENSION APPLIED: <strong style="color: var(--colors-token-green, #4CAF50);">+30 DAYS</strong> INCRYPTED+',
        'easter_close': 'CLOSE_TERMINAL',
        
        'hint_1': '🔑 The vault whispers... something is missing.',
        'hint_2': '🔒 A chest unopened holds no treasure.',
        
        'fortunes': [
            "The market can remain irrational longer than you can remain solvent.",
            "Cut your losses short. Let your winners run.",
            "Don't fight the trend. The trend is your friend.",
            "Price is the only truth. Everything else is noise.",
            "The best trade is sometimes no trade at all.",
            "Risk management is not a feature — it's the product.",
            "When in doubt, zoom out.",
            "Patience is the rarest alpha in a casino disguised as a market.",
            "Fear when others are greedy. Be greedy when others are fearful.",
            "Every lock has its key. Every vault has its secret."
        ]
    },
    uk: {
        'logo_text': 'Торговий Дашборд',
        'init_deposit': '01 // ПОЧАТКОВИЙ ДЕПОЗИТ',
        'pnl': '02 // ПРИБУТОК / ЗБИТОК',
        'mean_win_rate': '03 // СЕРЕДНІЙ ВІДСОТОК ПЕРЕМОГ',
        'total_volume': '04 // ЗАГАЛЬНИЙ ОБ\'ЄМ',
        'point_value': '05 // $/ПОІНТ',
        'active_streams': 'АКТИВНІ / ПОТОКИ ТЕЛЕМЕТРІЇ',
        'no_exchange_configured': 'НЕМАЄ НАЛАШТОВАНИХ БІРЖ. НАТИСНІТЬ "ДОДАТИ БІРЖУ" ДЛЯ ПОЧАТКУ.',
        'security_notice': '<strong>ПОВІДОМЛЕННЯ БЕЗПЕКИ:</strong> Ми не просимо і не зберігаємо ваші приватні ключі. Авторизація здійснюється через безпечні підписи Web3 EIP-712 та захищені сесії.',
        'btn_add_exchange': '[ + ] ДОДАТИ БІРЖУ',
        'btn_connect': 'Підключитись',
        'btn_disconnect': 'Відключитись',
        
        'modal_title': 'МОДУЛЬ / ПІДКЛЮЧЕННЯ БІРЖІ',
        'modal_close': 'ESC',
        'select_exchange': 'Виберіть Платформу',
        'wallet_address': 'Адреса Гаманця',
        'wallet_placeholder': '0x...',
        'api_key_label': 'API-Ключ (Тільки для Читання)',
        'api_key_placeholder': 'Вставте ваш API-ключ сюди',
        'api_key_desc': 'Extended вимагає Read-Only API-ключ. Цей ключ <strong>ніколи не зберігається</strong> на сервері або в localStorage. Існує тільки в пам\'яті поточної вкладки.',
        'label_label': 'Мітка',
        'label_placeholder': 'Напр. Основний, Торговий...',
        'btn_cancel': 'Скасувати',
        'btn_submit_add': 'Додати Біржу',
        
        'err_invalid_address': '⚠ Невірна адреса — має бути 42 символи і починатися з 0x',
        'err_no_address': '⚠ Адресу не вказано і гаманець не підключено',
        'err_already_added': '⚠ Цей гаманець вже додано для цієї біржі',
        'err_please_enter': '⚠ Будь ласка, введіть адресу гаманця',
        
        'syncing': 'СИНХРОНІЗАЦІЯ АКАУНТІВ БІРЖ...',
        'no_exchanges': 'БІРЖІ НЕ ДОДАНІ.',
        'refreshing': 'Оновлення...',
        'failed_sync': 'Помилка синхронізації',
        
        'card_init_deposit': '01 // ПОЧАТКОВИЙ ДЕПОЗИТ',
        'card_act_deposit': '02 // ПОТОЧНИЙ БАЛАНС',
        'card_volume': '03 // ОБ\'ЄМ',
        'card_points': '04 // ПОІНТИ',
        'card_rank': '05 // РАНГ',
        'card_pnl': '06 // ПРИБУТОК/ЗБИТОК',
        'card_win_rate': '07 // ВІДСОТОК ПЕРЕМОГ',
        'card_point_value': '08 // $/ПОІНТ',

        'easter_success': '🔓 ДОСТУП НАДАНО',
        'easter_title': 'РОЗСЕКРЕЧЕНІ ДАНІ',
        'easter_desc': 'ІДЕНТИФІКАТОР РОЗПІЗНАНО. ПОДОВЖЕННЯ ПІДПИСКИ: <strong style="color: var(--colors-token-green, #4CAF50);">+30 ДНІВ</strong> INCRYPTED+',
        'easter_close': 'ЗАКРИТИ ТЕРМІНАЛ',
        
        'hint_1': '🔑 Сейф шепоче... чогось не вистачає.',
        'hint_2': '🔒 Невикрита скриня не містить скарбів.',
        
        'fortunes': [
            "Ринок може залишатися ірраціональним довше, ніж ти платоспроможним.",
            "Швидко ріж збитки. Дозволяй прибуткам рости.",
            "Не йди проти тренду. Тренд — твій друг.",
            "Ціна — єдина істина. Все інше — шум.",
            "Найкращий трейд — це іноді відсутність трейду.",
            "Управління ризиками — це не функція, це сам продукт.",
            "Коли сумніваєшся — віддали графік (zoom out).",
            "Терпіння — найрідкісніша альфа в казино, замаскованому під ринок.",
            "Бійся, коли інші жадібні. Будь жадібним, коли інші бояться.",
            "До кожного замка є свій ключ. У кожного сейфа є свій секрет."
        ]
    }
};

class I18nManager {
    constructor() {
        this.lang = localStorage.getItem('lang') || 'en';
        this.initElements();
        this.applyTranslations();
    }

    t(key) {
        return translations[this.lang][key] || key;
    }

    setLanguage(lang) {
        this.lang = lang;
        localStorage.setItem('lang', lang);
        this.applyTranslations();
        document.getElementById('lang-toggle').textContent = lang === 'en' ? 'ENG' : 'UKR';
    }

    toggle() {
        this.setLanguage(this.lang === 'en' ? 'uk' : 'en');
        // trigger event to re-render dynamic strings in dashboard
        window.dispatchEvent(new Event('languageChanged'));
    }

    initElements() {
        const toggleBtn = document.getElementById('lang-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = this.lang === 'en' ? 'ENG' : 'UKR';
            toggleBtn.addEventListener('click', () => this.toggle());
        }
    }

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (translation) {
                // If the element has children like icons (e.g. inside a button), 
                // we might need to be careful. But for most nodes we can just innerHTML.
                // Or handle placeholders.
                if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                    el.placeholder = translation;
                } else {
                    el.innerHTML = translation;
                }
            }
        });
    }
}

window.i18n = new I18nManager();
