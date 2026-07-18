# Деплой «ДПС Радар» на VDS

## Что запускается

| Контейнер | Роль |
|-----------|------|
| `postgres` | База данных PostgreSQL 16 |
| `api` | Node.js сервер: Telegram webhook, REST API событий |
| `nginx` | Раздаёт Mini App (карта) + проксирует `/api/` на бэкенд |

Порт **80** открывается наружу. Предполагается, что на сервере уже есть
nginx/Caddy с SSL, который проксирует `https://ваш-домен.ru → localhost:80`.

---

## Быстрый старт

### 1. Скопируйте репозиторий на сервер

```bash
git clone <ваш-репо> /opt/dps-radar
cd /opt/dps-radar
```

### 2. Создайте `.env`

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env   # заполните все значения
```

### 3. Настройте ваш SSL-nginx (если ещё не настроен)

Пример `/etc/nginx/sites-available/dps-radar`:

```nginx
server {
    listen 443 ssl;
    server_name dps.ваш-домен.ru;

    ssl_certificate     /etc/letsencrypt/live/dps.ваш-домен.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dps.ваш-домен.ru/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:80;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}

# Редирект http → https
server {
    listen 80;
    server_name dps.ваш-домен.ru;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dps-radar /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Примените миграции БД

```bash
cd /opt/dps-radar

# Сначала поднимаем только postgres и ждём, пока он станет healthy
docker compose -f deploy/docker-compose.yml up -d postgres

# Применяем все миграции из lib/db/migrations/ через drizzle-kit migrate
# (сервис migrate использует builder-образ с pnpm и исходниками drizzle-kit)
docker compose -f deploy/docker-compose.yml \
  --profile migrate run --rm migrate
```

Drizzle записывает в таблицу `__drizzle_migrations` какие файлы уже применены,
поэтому повторный запуск безопасен — уже применённые миграции пропускаются.
После завершения сервис автоматически остановится.

> **При каждом обновлении** (если схема изменилась) запускайте тот же
> `docker compose … run --rm migrate` — скрипт `deploy/update.sh` делает
> это автоматически.

### 5. Запустите всё

```bash
cd /opt/dps-radar
docker compose -f deploy/docker-compose.yml up -d --build
```

Первый запуск занимает 3–5 минут (скачиваются образы, компилируется код).

### 6. Проверьте

```bash
# Логи бэкенда
docker compose -f deploy/docker-compose.yml logs -f api

# Должно появиться:
# INFO: Telegram webhook set successfully
# INFO: Bot menu button configured
# INFO: Server listening port=3000
```

Откройте `https://ваш-домен.ru` в браузере — должна открыться карта Благовещенска.

Добавьте бота в групповой чат Telegram и напишите что-нибудь вроде:
> «ДПС стоят на ул. Ленина»

Бот ответит и метка появится на карте.

---

## Миграции схемы БД

Схема хранится в `lib/db/src/schema/`. Миграционные файлы живут в
`lib/db/migrations/` и коммитятся в репозиторий.

### Как изменить схему

1. Внесите изменения в файлы `lib/db/src/schema/*.ts`.
2. Сгенерируйте новый SQL-файл миграции:

   ```bash
   # Запускается локально (DATABASE_URL нужен только как заглушка — к БД не подключается)
   DATABASE_URL=postgresql://x:x@localhost/x \
     pnpm --filter @workspace/db run generate
   ```

   В `lib/db/migrations/` появится новый файл вида `0001_*.sql`.

3. Закоммитьте сгенерированный файл вместе с изменениями схемы.
4. При следующем деплое `update.sh` автоматически применит новую миграцию.

> **Важно:** никогда не редактируйте существующие файлы миграций вручную —
> Drizzle сверяет хеши. Для исправления ошибки создайте новую миграцию.

### Применить миграции вручную (без полного деплоя)

```bash
cd /opt/dps-radar
docker compose -f deploy/docker-compose.yml --profile migrate run --rm migrate
```

### Переход с drizzle-kit push на миграции (один раз на каждый стенд)

Если база данных уже была инициализирована командой `drizzle-kit push`
(без истории миграций), перед первым запуском `update.sh` необходимо
выполнить разовую процедуру *baseline*.

> **Почему это нужно?**
> Файл миграции `0000_useful_tarot.sql` содержит `CREATE TABLE` / `CREATE TYPE`
> для всех таблиц. На пустой базе это нормально. На уже существующей базе
> PostgreSQL выдаст ошибку «already exists». Скрипт `baseline.sh` регистрирует
> миграцию `0000` как «уже применённую» в таблице отслеживания Drizzle
> (`drizzle.__drizzle_migrations`), не затрагивая сами данные.

**Шаги (выполнить один раз):**

1. Убедитесь, что контейнер `postgres` запущен:

   ```bash
   docker compose -f deploy/docker-compose.yml up -d postgres
   ```

2. Запустите baseline-скрипт, передав `DATABASE_URL`:

   ```bash
   DATABASE_URL=postgresql://dpsradar:<password>@localhost:5432/dpsradar \
     bash deploy/baseline.sh
   ```

   Скрипт идемпотентен — повторный запуск безопасен.

3. Убедитесь, что скрипт завершился с сообщением `Baseline complete`, затем
   продолжайте деплой как обычно:

   ```bash
   bash deploy/update.sh
   ```

`update.sh` сам проверяет наличие таблицы отслеживания и завершится с
понятной ошибкой, если baseline не был выполнен, — это защита от случайного
запуска migrate на push-based базе.

---

## Обновление

Используйте `make deploy` (или скрипт `deploy/update.sh` напрямую) — он
выполняет `git pull`, применяет миграции БД, пересобирает контейнеры и
автоматически запускает проверку здоровья:

```bash
cd /opt/dps-radar
make deploy
```

Скрипт завершится с ненулевым кодом и выведет диагностику, если бот
или вебхук не отвечают после деплоя.

### Другие команды Makefile

```
make help         Показать список всех команд
make up           Запустить контейнеры без пересборки
make down         Остановить контейнеры
make restart      Перезапустить без пересборки
make healthcheck  Только проверка здоровья (без деплоя)
make migrate      Только применить миграции
make logs         Логи API-сервера в реальном времени
make ps           Статус контейнеров
```

### Ручная проверка здоровья

Запустить проверку отдельно (без пересборки):

```bash
make healthcheck
# или напрямую:
bash deploy/healthcheck.sh
```

Проверяет:
1. `GET /api/health` — API-сервер отвечает
2. Telegram `getWebhookInfo` — вебхук зарегистрирован и нет последних ошибок

## Мониторинг и Telegram-алерты

### Статус healthcheck

Docker автоматически проверяет `GET /api/health` каждые 30 секунд.
Посмотреть текущий статус всех контейнеров:

```bash
docker compose -f deploy/docker-compose.yml ps
```

Колонка `STATUS` покажет `healthy`, `unhealthy` или `starting`.

### Вариант 1 — алерты через `docker events` (systemd-сервис)

Создайте скрипт `/opt/dps-radar/deploy/alert.sh`:

```bash
#!/usr/bin/env bash
# Отправляет сообщение в Telegram при переходе контейнера в unhealthy
# Переменные задаются в /opt/dps-radar/deploy/.env

set -euo pipefail
source /opt/dps-radar/deploy/.env  # читаем TELEGRAM_BOT_TOKEN и ALERT_CHAT_ID

docker events \
  --filter "event=health_status" \
  --filter "event=die" \
  --format "{{.Time}} {{.Actor.Attributes.name}} {{.Action}}" |
while read -r line; do
  if echo "$line" | grep -qE "unhealthy|die"; then
    HOST=$(hostname)
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${ALERT_CHAT_ID}" \
      --data-urlencode "text=🚨 [${HOST}] $line" > /dev/null
  fi
done
```

Добавьте в `.env`:

```dotenv
ALERT_CHAT_ID=123456789   # ID чата или пользователя, куда слать алерты
```

Зарегистрируйте как systemd-сервис `/etc/systemd/system/dps-alert.service`:

```ini
[Unit]
Description=DPS Radar Docker health alert
After=docker.service
Requires=docker.service

[Service]
ExecStart=/bin/bash /opt/dps-radar/deploy/alert.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dps-alert
```

### Вариант 2 — простой cron каждую минуту

Добавьте строку в `crontab -e` от пользователя, под которым запущен Docker:

```cron
* * * * * /bin/bash /opt/dps-radar/deploy/healthcheck.sh \
  || curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
       --data-urlencode "chat_id=${ALERT_CHAT_ID}" \
       --data-urlencode "text=🚨 $(hostname): /api/health check FAILED" > /dev/null 2>&1
```

> **Совет:** `healthcheck.sh` завершается с кодом 1 при любой ошибке,
> поэтому `||` сработает только при реальном сбое.

---

## Остановка

```bash
docker compose -f deploy/docker-compose.yml down
```

## Удаление (с данными)

```bash
docker compose -f deploy/docker-compose.yml down -v
```

---

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `POSTGRES_PASSWORD` | Пароль базы данных |
| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather |
| `PUBLIC_BASE_URL` | Ваш домен с HTTPS (напр. `https://dps.example.ru`) |
| `SESSION_SECRET` | Случайная строка ≥ 32 символа |

## Настройка бота в Telegram

1. В @BotFather: `/setdomain` → укажите `ваш-домен.ru` (нужно для Web App кнопки)
2. В @BotFather: `/mybots` → ваш бот → **Bot Settings** → **Menu Button** →
   URL `https://ваш-домен.ru` (или настроится автоматически при старте)
3. Добавьте бота в групповой чат с правами **чтения сообщений**

---

## Структура портов

```
Интернет (443 HTTPS)
    ↓
nginx на хосте (SSL-терминация, certbot)
    ↓
localhost:80
    ↓
Docker: nginx контейнер
    ├── /api/* → api:3000 (Node.js)
    └── /*     → статика Mini App
```
