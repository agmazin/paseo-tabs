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
Проверяется контракт экспортов. Требование manifest сужено до `>=0.14.0 <0.14.1`.
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
- Подготовленный native 0.4.2: `9d710c8e3b9e4bc967c4896f2bc9cb956feeb201e07717a292b553c7e130043f`
- Подготовленный index 0.4.2: `a8d4646645f2c6d5652c4ed065f4d6457bf7ed00d3ff83eeeaa5a63a29f17572`

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
