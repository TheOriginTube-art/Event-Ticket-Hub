# Развёртывание TicketFlow на своём сервере (VDS)

Всё, что нужно — Docker. Скрипт `docker compose` сам поднимет базу данных,
API и сайт.

## 1. Установите Docker на сервере

Подключитесь к серверу по SSH и выполните:

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Скачайте код

```bash
git clone https://github.com/TheOriginTube-art/Event-Ticket-Hub.git
cd Event-Ticket-Hub
```

## 3. Настройте переменные окружения

```bash
cp .env.example .env
nano .env
```

Заполните как минимум:
- `POSTGRES_PASSWORD` — любой надёжный пароль
- `SESSION_SECRET` — случайная строка (можно получить командой `openssl rand -hex 32`)
- `PUBLIC_BASE_URL` — адрес, по которому будет открываться сайт (например `http://135.106.174.223` или ваш домен, если он привязан к серверу)

Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) можно оставить пустыми —
сайт запустится, но покупка билетов будет недоступна, пока вы не добавите
свои ключи из личного кабинета Stripe.

## 4. Запустите

```bash
docker compose up -d --build
```

Первый запуск займёт несколько минут (сборка). После этого сайт будет
доступен по адресу из `PUBLIC_BASE_URL` (порт задаётся в `WEB_PORT`,
по умолчанию 80).

## 5. Проверка и обновление

Посмотреть логи:

```bash
docker compose logs -f
```

Обновить после изменений в коде:

```bash
git pull
docker compose up -d --build
```

## Подключение Stripe позже

1. Создайте аккаунт на stripe.com, возьмите Secret key из раздела Developers → API keys.
2. Впишите его в `.env` как `STRIPE_SECRET_KEY`.
3. В разделе Developers → Webhooks создайте endpoint `https://ваш-домен/api/stripe/webhook`, скопируйте Signing secret в `STRIPE_WEBHOOK_SECRET`.
4. Перезапустите: `docker compose up -d --build`.
