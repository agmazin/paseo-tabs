# Проверка и внедрение 0.4.1

Ветка `fix/close-dialog-ui` создана от merged main `9671fc4`.
Новый UI общий для plugin runtime и native bootstrap: зелёная "Закрыть",
оранжевая "Архивировать", крестик справа сверху с именем "Отменить закрытие".
Первоначальный фокус на крестике, видимая рамка, Tab/Shift+Tab остаются в диалоге.
Крестик и Escape отменяют действие. Защита закрытия и архивирования сохранена.

Архивные root/child закрываются сразу локально, без модалки и archive/resume/unarchive.
Native берёт snapshot из session store указанного host/agent; если архивного snapshot
нет в активном списке, читает fetchAgent через client того же host, не восстанавливая чат.
Fallback заимствует getPaseoClient по host из workspaceKey, refresh указанного agent
проверяет workspaceId. Неизвестный статус или недоступный store блокируют действие.
Перед загрузкой store ранний guard только блокирует: модалки без статуса нет.
Подписка на статус отменяет открытый диалог при архивации/удалении. Проверка
isCurrent защищает timer и finish, статус повторно проверяется перед действием.
Ни один путь закрытия не вызывает resume/unarchive.
Заимствующий API resolver обновляется при каждой загрузке плагина: сохраняемый guard
после reload использует lifetime новой установки, не освобождённый API старой.
Native marker 0.4.0 включает fallback нового плагина, поэтому новые правила закрытия
действуют сразу после plugin reload без перезагрузки UI. Native 0.4.1 использует новый callback.

## Проверки

TypeScript и 16 тестов без пропусков прошли локально. Существующий тест native
расширен переходом с установленного 0.4.0, идемпотентностью, rollback ровно к 0.4.0,
отказом при изменённом index и неизвестном bundle. Проверяется исходный bundle
по точному SHA, callback покрывает idle/running root/child без платных ходов.

Живая матрица `tests/browser/close-choice.mjs` выполнена в четырёх режимах:
native, plugin без native, combined, hot-upgrade (native 0.4.0 + plugin 0.4.1). Везде проверены подписи, цвета, доступное имя,
начальный/видимый фокус, циклический Tab, крестик/Escape, close без архива,
сохранение скрытия после UI reload, повторное открытие, невыбранный child/root,
быстрые клики, смена вкладки, ошибка диалога, Cmd+W и явная архивация fixtures.
Живой прогон дополнен archived root/child: внешний archive при открытом диалоге
отменяет его, затем та же архивная вкладка открывается локально и закрывается крестиком
без диалога. На UI websocket проверяется отсутствие archive/resume/unarchive запросов,
состояние archivedAt на демоне сохраняется. Это выполнено отдельно в native/plugin/combined/hot-upgrade.
Проверен plugin reload с открытым диалогом в plugin/combined и отсутствие runtime
в native. Снимки wide/compact визуально проверены, переполнения нет.

Среда: скрытый отдельный Electron 44.2, оригинальный preload, копия app-dist 0.14.0,
отдельный daemon 0.14.0 на 127.0.0.1:6812. Только idle fixtures без промптов.
Основной хост, установленный плагин и app-dist не менялись; выполнялся только check.
Проверка основного установленного bundle/index подтверждает совместимость перехода.

Отдельно `close-choice-edges.mjs` проверил unavailable/delayed discovery:
ранний guard не показывает диалог без статуса и не откладывает закрытие/архивирование.

Логи и JSON в `docs/evidence/close-choice-0.4.1/`.
Снимки исключены из git и сохранены локально в подкаталогах native/plugin/combined:
`mandatory-choice-wide.png`, `mandatory-choice-compact.png`.

## Точные SHA-256

- Native 0.4.0: `8408efbadbedc495b412ad1f2bb61d310d29878e7958f2792b79de705e379647`
- Index 0.4.0: `7ce1fe368c8b087ee64b9e609ef6cf36fc5037b31cb2607e4268b902fa107d83`
- Native 0.4.1: `80161ccff233ffc308473699ed096d9a228d2f215f085665571d48ba50701a8f`
- Index 0.4.1: `738f1a9a437b7dcce8b272b787e8fe2f2a6f0d81ab9b0ec996da8e3012efe484`

Оригинальные SHA и три точные замены остаются прежними. Неизвестная пара
bundle/index отклоняется до записи. Обновление строится из проверенного original
backup, а не заменой произвольного runtime в установленном bundle.
Версионный record `e34d305be181eda51066d03f7d1516b4603cc4661643e1ca3d818f2bba3e7363-0.4.1.json`
сохраняет точные предыдущие SHA. Старый record 0.4.0 не перезаписывается.
Предыдущие bundle/index сохраняются под их SHA, backup проверяется до записи.
Rollback восстанавливает пару, с которой выполнен apply: 0.4.0 либо оригинал.
Временные файлы и rename сохранены; ошибка rename возвращает исходную пару.

## Команды техлиду

После технической приёмки и merge выпустить v0.4.1 на merged commit.
Выполнять из release checkout, не из исходного рабочего дерева:

```sh
cd /Users/agmazin/Library/Developer/paseo-releases/paseo-tabs
git fetch origin --tags
git switch --detach v0.4.1
npm ci
npm run typecheck
paseo plugin reload paseo-tabs
paseo plugin ls
node --experimental-strip-types scripts/native-close-patch.mts check /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
node --experimental-strip-types scripts/native-close-patch.mts apply /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
node --experimental-strip-types scripts/native-close-patch.mts check /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
```

Сначала проверить фактический plugin runtime `window.__paseoTabsClose.version`
и `window.__paseoTabClosePolicy.version`: оба 0.4.1. Уже открытый renderer получает
новый UI через plugin reload, без перезапуска UI/демона. Native marker может остаться
0.4.0 до следующей загрузки UI; изменение файла не доказывает его загрузку.
В будущем после разрешённой загрузки UI проверить native marker 0.4.1 и новый script
cache key. Не перезагружать UI с пользовательскими черновиками ради проверки.

Откат native:

```sh
node --experimental-strip-types scripts/native-close-patch.mts rollback /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
```

При откате с 0.4.1 на 0.4.0 plugin runtime остаётся 0.4.1 до отдельного отката
release checkout и reload. Оба runtime сохраняют обязательный выбор, архивы не восстанавливают.
Другие плагины, основной демон и UI не перезапускать.
