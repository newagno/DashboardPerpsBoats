# Етап 1. Збір інформації

## 1. Огляд
- **Призначення**: Веб-додаток (Dashboard) з Express.js бекендом (запуск через Vercel serverless functions або локально) та статичним фронтендом.
- **Тип проєкту**: Веб-додаток та API.
- **Дерево директорій**:
  - \pi/\ - Vercel serverless функція-адаптер (\index.js\).
  - \ackend/\ - Логіка бекенду (\server.js\, \controllers/\, \utils/\).
  - \public/\ - Статичні файли фронтенду (\css/\, \js/\, \ssets/\, \dashboard.html\, \landing.html\).
  - \.antigravity/\ - Документація і знання від середовища (ігноруємо для аналізу коду).

## 2. Стек
- **Мови**: JavaScript (Node.js/Браузер), HTML, CSS.
- **Фреймворки/Бібліотеки**: Express.js (бекенд), Vercel (роутинг). \ethers\, \zod\, \ioredis\, \helmet\.
- **Менеджер пакетів**: npm (є \package-lock.json\).

## 3. Метрики
- **A1 (Найбільші файли коду)**: 
  1. \ackend/extended-debug.json\ (1921 рядків)
  2. \ackend/server.js\ (890 рядків)
  3. \public/dashboard.html\ (530 рядків)
  (всі інші менші).
- **A2 (Файли за розширенням)**: .md (109), .js (18), .mdx (15), .py (15), .json (10), .png (6), .html (4), .css (4).
- **A3 (Секрети)**: Жодних хардкод-секретів не виявлено в коді. У \.env\ наявний \REDIS_URL\.
- **A4 (Дублювання)**: skipped (jscpd відсутній).
- **A5 (Git-статистика)**: Неможливо вивести повну статистику без доступу до jq та git rev-list в даному PowerShell-оточенні, хоча це git репозиторій.
- **A6 (Інфраструктура)**: Знайдено \.env\, \.env.example\, \ercel.json\, \package.json\.
- **B1 (Вразливості)**: \
pm audit\ знайшов проблеми (наприклад, \xios\ прототипне забруднення, severity high).
- **B2 (Застарілість)**: Є пакети, але jq недоступний для парсингу outdated.json.
- **B3-B8**: skipped (інструменти відсутні: knip, tsc, eslint, lizard, madge, ALLOW_TEMP_TOOLS=no).
- **B9 (Точки входу)**: \pp.get('/dashboard')\, \pp.get('/api/health')\, \pp.post('/api/exchanges/keys/store')\, \pp.post('/api/exchanges/extended/stats')\ тощо (всього 20 точок в \ackend/server.js\).
- **B10 (Тести)**: 0 знайдено (немає \*.test.js\, \*.spec.js\).

## 4. Архітектура (факти)
- Фронтенд (HTML/JS) викликає API, реалізоване в \ackend/server.js\.
- Бекенд взаємодіє з Redis (ioredis), Vercel для деплою (\ercel.json\), та зовнішніми API (\EXTENDED_API_URL\, \NADO_GATEWAY_URL\ з \.env\).

## 5. Дані та інтеграції
- **БД / Кеш**: Redis (\ioredis\, \ate-limit-redis\).
- **Зовнішні API**: Starknet Extended, Nado, Variational (визначено через \.env\).

## 6. Інфраструктура
- Розгортання через Vercel (\ercel.json\).
- Логування: \winston\.

## 7. Якість коду
- **Тести**: 0.
- **Лінтери/Форматери/Типізація**: Жодних конфігурацій (TypeScript чи ESLint) не виявлено.
- Зважаючи на великий розмір \server.js\ (890 рядків), логіка зосереджена в одному файлі.

## 8. Неочевидне
- \pi/index.js\ є прошарком, який підхоплює \ackend/server.js\ як serverless-функцію Vercel.

## 9. Надійність
- Присутній \express-rate-limit\ та Redis (для сесій чи рейтлімітів). Helmet налаштований.

## 10. Секрети й дані
- \REDIS_URL\ є в \.env\. Відсутність витоку секретів в логах або жорстко закодованих (за результатами пошуку regex).

## 11. Документація і попередні аудити
- Є \README.md\ та \ROLLBACK.md\. Розбіжностей з кодом на перший погляд не знайдено (обидва вказують на функціонал дашборду).

## Гіпотези
1. **Гіпотеза 1**: \server.js\ перевантажений (890 рядків), ймовірно містить як бізнес-логіку, так і налаштування сервера. -> [не перевірено]
2. **Гіпотеза 2**: Відсутність тестів робить будь-який рефакторинг небезпечним. -> [не перевірено]
3. **Гіпотеза 3**: Використання Vercel з Express може мати проблеми зі станом або вебсокетами, оскільки Serverless функції stateless. -> [не перевірено]

## Журнал команд
| ID блоку | Команда (скорочено) | Статус (ok/fail/skipped) | Ключове число або причина |
|---|---|---|---|
| A1 | Find largest files | ok | Top 3: 1921, 890, 530 |
| A2 | Files by extension | ok | .md (109), .js (18) |
| A3 | Secrets | ok | 0 leaks in code |
| A4 | jscpd | skipped | jscpd відсутній |
| A5 | git stats | skipped | jq/bash недоступні |
| A6 | Infra | ok | vercel.json found |
| B1 | npm audit | ok | vulnerabilities found |
| B2 | npm outdated | skipped | jq відсутній |
| B3 | unused deps | skipped | knip відсутній |
| B4 | tsc strict | skipped | Not a TS project |
| B5 | Type checks bypass | skipped | Not a TS project |
| B6 | ESLint | skipped | No ESLint |
| B7 | CCN | skipped | lizard відсутній |
| B8 | Madge | skipped | madge відсутній |
| B9 | Entry points | ok | 20 API routes |
| B10| Test count | ok | 0 |
