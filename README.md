# Ural Campus Calendar Pages

Статический сайт для подписки на расписание Урал Кампус через `.ics`.

## Как это работает

1. GitHub Actions каждый день запускает `npm run update`.
2. Скрипт получает список групп и преподавателей из API `rasp.ural-campus.ru`.
3. Для каждой группы и каждого преподавателя генерируется календарь на ближайшие 6 месяцев.
4. Файлы лежат в `public/calendars/.../*.ics`, а сайт на GitHub Pages дает ссылку для подписки.
5. Когда событие выходит из 6-месячного окна, оно переносится в соседний архив `*.ics.old`.

Подписочные ссылки стабильные, потому что строятся по `guid`, а не по названию группы или ФИО.

## Локальная проверка

```powershell
npm test
npm run update -- --institution inueco --type group --name И-107 --months 1 --output .tmp-public
npm run serve
```

После `npm run serve` сайт будет доступен на `http://localhost:4173`.

## Первый запуск на GitHub

1. Создайте новый публичный репозиторий на GitHub.
2. Запушьте этот каталог в `main`.
3. Откройте `Settings -> Pages`.
4. В `Build and deployment` выберите `Source: GitHub Actions`.
5. Откройте вкладку `Actions` и запустите `Update schedule calendars` вручную.

После первого успешного запуска GitHub Pages покажет URL сайта. Обычно это:

```text
https://<github-user>.github.io/<repo-name>/
```

## Команды генератора

Полная генерация:

```bash
npm run update
```

Только одна группа:

```bash
npm run update -- --institution inueco --type group --name И-107
```

Только один преподаватель:

```bash
npm run update -- --institution preco --type teacher --name "Фамилия Имя Отчество"
```

Полезные флаги:

- `--months 6` — горизонт текущего `.ics`, по умолчанию 6 месяцев.
- `--output public` — папка публикации, по умолчанию `public`.
- `--concurrency 4` — сколько расписаний загружать параллельно.
- `--dry-run` — посчитать изменения без записи файлов.

## Важные ограничения

Google Calendar и Outlook обновляют подписные `.ics` не мгновенно. Сайт и файлы могут обновиться утром, а календарь пользователя подтянет изменения позже.

GitHub Actions schedule запускается на default branch. В публичных репозиториях scheduled workflows могут отключаться после долгой неактивности репозитория.
