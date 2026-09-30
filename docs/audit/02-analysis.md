# Етап 2. Аналіз

## 1. Синтез архітектури
\\\mermaid
graph TD
    Client[Web Client] --> API[Express API / Vercel]
    API --> Redis[Redis Vault / Store]
    API --> Starknet[Starknet Extended API]
    API --> Nado[Nado API]
    API --> Variational[Variational API]
\\\

| Ребро | Джерело |
|---|---|
| Client → API | \ackend/server.js:130\ (dashboard.html взаємодіє з API) |
| API → Redis | \ackend/server.js:169\ (\ault:\:\\ запис) |
| API → Starknet | \ackend/server.js\ (http клієнт, \EXTENDED_API_URL\) |
| API → Nado | \ackend/server.js\ (http клієнт, \NADO_GATEWAY_URL\) |
| API → Variational | \ackend/server.js\ (http клієнт, \VARIATIONAL_API_URL\) |

*(Кількість ребер відповідає знайденим викликам зовнішніх сервісів; метрики fan-in/fan-out недоступні через відсутність madge)*.

## 2. Закриті гіпотези
- **Гіпотеза 1** (\server.js\ перевантажений і містить і бізнес-логіку і налаштування сервера): \[підтверджено]\ (рядки 100-180 містять налаштування rate-limit, CSRF-захист, та бізнес-логіку зберігання ключів).
- **Гіпотеза 2** (Відсутність тестів робить рефакторинг небезпечним): \[підтверджено]\ (кількість тестів = 0).
- **Гіпотеза 3** (Vercel з Express може мати проблеми зі станом): \[підтверджено]\ (\server.js:105\ містить in-memory rate-limiter, який буде скидатися на кожному cold start у Vercel).

## 3. Оцінки
| Критерій | Оцінка | Докази | Що підняло б на +1 |
|---|---|---|---|
| Архітектура та модульність | Не оцінено | Відсутній інструмент madge (B8 skipped) | Встановлення madge та розбиття \server.js\ на контролери і роути |
| Читабельність і підтримуваність | Не оцінено | Відсутні інструменти jscpd (A4) та lizard (B7) | Розділення логіки на окремі модулі |
| Безпека | 3 | Вразливості в axios (npm audit). Є CSRF і Helmet, секретів у коді немає. | Оновлення axios та налаштування жорсткішого CORS |
| Продуктивність і масштабованість | Не оцінено | Відсутній lizard (B7) | Використання Redis для rate limit замість memory store |
| Надійність і спостережуваність | 3 | В \xios.create()\ є timeout, але in-memory rate limit скидається в Vercel. Є winston logger. | Використання RedisStore для express-rate-limit |
| Дані та приватність | 3 | PII немає. Токени шифруються в Redis Vault і HttpOnly cookies. | Додавання шифрування токенів перед записом в Redis |
| Тестованість | 1 | 0 тестів. Логіка зав'язана на Express (req, res). | Написання юніт-тестів на ключові функції, відокремлення логіки від роутів |
| Документація | 4 | Є README.md і ROLLBACK.md. Розбіжностей з кодом не знайдено. | Опис API endpoint-ів у Swagger або Postman |
| DevOps і відтворюваність | 4 | Наявні \package-lock.json\, \ercel.json\, та \.env.example\. | Написання Dockerfile або CI/CD pipelines (GitHub Actions) |

## 4. Гіпотези до перевірки
- **Гіпотеза 4**: In-memory \express-rate-limit\ може дозволяти брутфорс, оскільки Vercel створює багато ізольованих інстансів. -> [не перевірено]

## Журнал команд
| ID блоку | Команда (скорочено) | Статус (ok/fail/skipped) | Ключове число або причина |
|---|---|---|---|
| C11 | find timeout | ok | \xios.create({ ... global timeout })\ |
