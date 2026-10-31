# Проверка 0.4.2

Исходная ветка `fix/native-dialog-style` создана от актуального `origin/main` `1de4986`.
Рабочее дерево: `/Users/agmazin/Yandex.Disk.localized/public/projects/local/paseo-tabs-native-style`.
Основной release checkout остаётся `ded46f6`, версия 0.4.1. Основное приложение не изменялось.

## Штатный интерфейс

Окно фактически рендерит `AdaptiveModalSheet` из установленного клиента Paseo 0.14.0.
Этот же компонент используется штатным `AdaptiveRenameModal` и публичным plugin `Modal`.
Заголовок и SVG-крестик принадлежат `SheetHeaderView` / `SheetHeaderIconButton` с Lucide X.
Обе кнопки рендерит штатный `Button`, размер sm, как в штатном AdaptiveRenameModal: высота 32, радиус 12, горизонтальный отступ 12.
Обе кнопки занимают равные колонки с промежутком 8.
Широкое окно имеет штатные maxWidth 520, радиус 12, фон surface1, границу surface2,
поля 24, заголовок 14/500. На узком экране используется штатная нижняя шторка.
Цвета текста, поверхности, отступы и геометрия принадлежат текущей теме.
"Закрыть" использует штатный default/accent. "Архивировать" имеет явно оранжевый #f97316
и тёмный текст #18181b; контраст этой пары примерно 6.3:1.
Крестик не имеет фона, постоянной границы и рамки первоначального фокуса.
Его визуальные отступы от верхней и правой границ заголовка равны: правый внешний
отступ компенсирован на штатный padding самой иконки. Tab показывает кольцо theme.colors.ring.

Host exports заимствуются из точной сборки Paseo 0.14.0 через Metro, как существующий layout store.
Перед любым Metro require проверяется точное имя content-addressed entry asset
`index-4df2750168de94b9b8fdf3170859afa9.js`, затем контракт экспортов.
Manifest сохраняет прежнее `>=0.12.0 <0.15.0`: оно применяется и к демону, и к app,
поэтому не может описывать совместимость только desktop UI. Native patch отдельно
проверяет SHA-256 исходного bundle/index перед записью.
Это явно ограниченная совместимость с текущим клиентом, а не копия его CSS.
Скрытый, перекрытый или невидимый диалог не может подтвердить действие: перед выбором
проверяются hit testing контролов и visibility/opacity их предков.

Эталонные исходники: checkout Paseo v0.14.0 в
`/Users/agmazin/Yandex.Disk.localized/public/projects/local/paseo-client-patches/.upstream-v014/packages/app/src`:
`components/adaptive-modal-sheet.tsx`, `components/ui/button.tsx`,
`components/ui/control-geometry.ts`, `components/rename-modal.tsx`, `styles/theme.ts`.
Актуальные официальные plugin docs прочитаны с https://paseo.sh/llms.txt,
https://paseo.sh/docs/plugins.md, https://paseo.sh/docs/plugins/reference.md и
https://paseo.sh/docs/plugins/publishing.md.

## Проверки

Typecheck и 16 тестов без skip: callback для idle/running root/child, stale/unknown status,
архивные вкладки, host isolation, оригинальный native и миграция с установленной 0.4.1,
идемпотентность, rollback ровно к исходной паре, неизвестный bundle/index и подмена bundle
с правильным marker. Все проверки выполнялись на копиях.

`close-choice.mjs` прошёл в native-only, plugin-only, combined и hot-upgrade.
В hot-upgrade сначала загружен native 0.4.1 при отключённом тестовом плагине; затем
плагин 0.4.2 включён на уже открытом renderer. Без reload страницы проверены версии
policy/plugin 0.4.2 при native marker 0.4.1 и все действия закрытия.
Проверены X/Escape, начальный фокус, циклический Tab, локальное скрытие с сохранением
после reload, повторное открытие, невыбранные root/child, быстрые клики, отмена при
смене вкладки, ошибка построения окна, Cmd+W, plugin reload с открытым окном,
архивация во время выбора и локальное закрытие archived root/child без диалога.
UI websocket подтверждает отсутствие archive/resume/unarchive при локальном закрытии;
archive_agent_request отправляется только после явного выбора "Архивировать".
`close-choice-edges.mjs` также прошёл для delayed/unavailable discovery: ранний guard
блокирует действие без модалки и без отложенного закрытия/архивирования.

`visual-style.mjs` проверяет 1440x900 и 390x844 в светлой и тёмной темах:
hit testing всех трёх контролов, отсутствие переполнения, настоящий SVG X без рамки
при начальном фокусе, кольцо после Tab и отмену реальным кликом.
Для каждой комбинации снят также настоящий `AdaptiveRenameModal` того же клиента
как штатный визуальный эталон. Обработчик его сохранения не изменяет данные.
PNG исключены из git, находятся в
`/Users/agmazin/Yandex.Disk.localized/public/projects/local/paseo-tabs-native-style/docs/evidence/close-choice-0.4.2/visual`.
JSON-результаты четырёх режимов и метрики визуальной проверки включены в git.

Среда: отдельный демон 0.14.0 на 127.0.0.1:6812, отдельный home и копия app-dist
в `.fixture`, скрытый Electron 44.2 с оригинальным preload.
Только idle fixtures без промптов. Вкладки основного Paseo не открывались, фокус не менялся.

## SHA-256

- Установленный native 0.4.1: `80161ccff233ffc308473699ed096d9a228d2f215f085665571d48ba50701a8f`
- Установленный index 0.4.1: `738f1a9a437b7dcce8b272b787e8fe2f2a6f0d81ab9b0ec996da8e3012efe484`
- Подготовленный native 0.4.2: `2fb0ec9e897d41a501b75b40d28fabfe05959f535d446d89650c8f896ba79633`
- Подготовленный index 0.4.2: `383981f899f65852e30c81c9f2f9b4582e527594b56cccb4e8929c4b141162bf`

Неизвестная пара отклоняется до записи. Патч строится только из exact original backup.
Новый record `e34d305be181eda51066d03f7d1516b4603cc4661643e1ca3d818f2bba3e7363-0.4.2.json`
сохраняет исходную пару, старые записи 0.4.0/0.4.1 не меняются. Rollback возвращает
именно предыдущую пару 0.4.1 либо оригинал. Ошибка rename восстанавливает оба исходных файла.

## Установка после приёмки техлидом

Команды подготовлены, на основной установке не выполнялись. Локальный fetch позволяет
внедрить проверенный commit без зависимости от удалённого GitHub:

```sh
cd /Users/agmazin/Library/Developer/paseo-releases/paseo-tabs
git fetch /Users/agmazin/Yandex.Disk.localized/public/projects/local/paseo-tabs-native-style fix/native-dialog-style
git switch --detach FETCH_HEAD
npm ci
npm run typecheck
paseo plugin reload paseo-tabs
paseo plugin ls
node --experimental-strip-types scripts/native-close-patch.mts check /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
node --experimental-strip-types scripts/native-close-patch.mts apply /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
node --experimental-strip-types scripts/native-close-patch.mts check /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
```

Проверить фактические `window.__paseoTabsClose.version` и
`window.__paseoTabClosePolicy.version`: обе 0.4.2, без reload UI/демона.
Native marker уже открытого renderer останется 0.4.1: это ожидаемо.
Новый native 0.4.2 загрузится при следующем обычном открытии UI. Ради проверки
не перезагружать UI с черновиками. После merge выпуск v0.4.2 должен указывать на merged commit.

## Откат

Сначала из checkout 0.4.2 вернуть native, затем откатить плагин:

```sh
cd /Users/agmazin/Library/Developer/paseo-releases/paseo-tabs
node --experimental-strip-types scripts/native-close-patch.mts rollback /Applications/Paseo.app/Contents/Resources/app-dist /Users/agmazin/Library/Developer/paseo-tabs/native-close-backups
git switch --detach v0.4.1
npm ci
paseo plugin reload paseo-tabs
paseo plugin ls
```

Основной UI и демон не перезапускать. Проверить фактический plugin/policy marker 0.4.1.

## Исправление совместимости после технической приёмки

`requirements.paseo` проверяется до запуска кода в обоих runtime:
- Paseo 0.13.2: `packages/server/src/server/plugins/index.ts:691` (checkRequirements),
  также при запуске в строке 258; используется `this.daemonVersion`, runtime daemon.
- App/Android: `packages/app/src/plugins/registry.ts:76`; используется версия app,
  проверка выполняется до создания runtime и evaluation client bundle.
- Общая функция: `packages/protocol/src/plugin-requirements.ts:22`,
  `assertPluginCompatibility`. Исходник этой функции в локальных checkout 0.13.2 и
  0.14.0 побайтово одинаков (проверено cmp); тест использует этот настоящий protocol helper.

Manifest возвращён к прежнему `>=0.12.0 <0.15.0`. Проверены daemon/app 0.13.2,
а также 0.12.0 и 0.14.0; прежний ошибочный узкий диапазон воспроизведён как reject
для обоих runtime 0.13.2. Значит обновление desktop UI не блокирует plugin catalog
основного демона или Android 0.13.2.

Точный desktop asset проверяется в hostCloseUi до любого числового Metro lookup.
Неподдерживаемый web build отменяет выбор; числовые модули другого клиента не загружаются.
Native patch по-прежнему допускает только точные SHA исходного bundle/index.
Android/iOS без DOM не обращаются к этому guard или UI-модулям.

Typecheck и все 19 тестов без skip прошли после исправления. Дополнительные тесты:
настоящий requirements helper для обоих runtime, unknown build без единого Metro lookup,
exact entry с cache key и validation экспортов. Проверка native check на основной
установке выполнена только для чтения; подготовленные SHA выше обновлены.
Предыдущая живая визуальная матрица относится к неизменённому UI; эта правка добавляет
проверку asset перед его использованием, не меняя отображение.

Fixture home остановлен: status localDaemon=stopped, pid=null, connectedDaemon=not_probed.
Listener 6812 отсутствует, процессов choice-host.cjs и тестового daemon home нет.
В этой корректировке fixture runtime не запускался; основной демон и prod не менялись.
