# Paseo "Вкладки"

Плагин Paseo: навигация по вкладкам рабочего пространства, когда их много (15-20 и больше).

Состояние на 21.10.2026: принято Александром ("Вкладки принимаем, с первого раза все ок"), в основном Paseo
стоит v0.2.0 (с 22.10.2026) из клона `/Users/agmazin/Library/Developer/paseo-releases/paseo-tabs`. Вариант Б (листалка и список);
0.1.1 - правая панель (Файлы, Изменения, панели плагинов) не получает кнопку списка. 0.2.0 (пара кружков
"работают подагенты" на вкладках) принята Александром 22.10.2026.
Задание - `docs/source/2026-10-21-task.md`.

0.2.0 (22.10.2026) - индикатор "сам чат стоит, работают его подагенты", как в Диалогах 0.8:
- вкладка чата, который отдыхает (родной статус done или attention), а хотя бы один потомок (подагент, его
  подагент) running - на месте родного значка пара синих кружков, подсказка вкладки "Работают подагенты: N";
  needs_input, failed и running самого чата важнее - тогда родной значок; вкладка подагента - родная;
- за краем ленты пара - метка "работают подагенты" (ниже "!" и ошибки, выше "закончил"), в списке - та же пара у строки;
- кружок как в Диалогах: точка 5x5, вырез 10x10 цветом фона вкладки, крутилка 10x10 с рамкой 1.2, 0.9 с на оборот;
  все пары плагина в одной фазе (у CSS-анимаций `pt-spin` общий startTime 0); пара абсолютная, ширина вкладки не меняется;
- иконка вкладки 14x14 (в Диалогах 16x16), подпись в 4 px справа, поэтому центры кружков 7.5/13.5 и 14.5/13.5
  от угла иконки: пара не выходит дальше родного значка и не наезжает на название;
- данные - клиентский API плагина, без сервера: `paseo.agents.list` раз в минуту + `paseo.agents.subscribe`
  (одна подписка `list({subscribe})` на хост), родитель - `parentAgentId` или метка `paseo.parent-agent-id`.
  Проверка - `docs/verification-0.2.0.md`.

Что делает 0.1.0 (только веб и настольное приложение, на телефоне ничего):
- вкладки не сжимаются до 64 px: ширина по названию, до 160 px (родной максимум), лишнее уходит в прокрутку;
- обычное колесо мыши листает ленту; тачпад работает как раньше;
- лента сама доезжает до открытой вкладки (переключение клавишами, из "Диалогов", из списка);
- по краям счётчики спрятанных вкладок, клик листает на экран; метка самого важного статуса за краем:
  "!" ждёт ввода, красная - ошибка, зелёная - закончил и не прочитан;
- кнопка со счётчиком после ленты: список всех вкладок по порядку, поиск (без учёта регистра и ё),
  ↑↓ Enter Esc, родные статусы и подсказки родных клавиш перехода.

Устройство:
- `client/web.ts` - весь DOM и подписка на агентов, только под `Platform.OS === "web"`; `shared/model.ts` - чистая
  логика (в том числе `runningDescendants`, `tabBucket`), тесты `tests/model.test.mts`; `index.client.ts` - точка
  входа, сервера нет.
- Метки Paseo 0.12.0: `workspace-tabs-row` > контейнер > `workspace-tabs-scroll`; вкладки -
  `button[data-testid^="workspace-tab-"][aria-selected]`, имя в `aria-label`, статус в `data-status-bucket`
  (needs_input, failed, running, attention, done). Ширину вкладки Paseo задаёт классом unistyles
  (min/max/width 64), плагин перебивает её `!important` только у лент со своим атрибутом `data-paseo-tabs`.
  Лента в правой панели (Файлы, Изменения, панели плагинов: `workspace-explorer-sidebar`,
  `native-explorer-sidebar-dock`, `workspace-pane-explorer`) не трогается.
- Грабля: React Native Web подменяет `scrollTo`/`scrollBy` у узла ScrollView своей сигнатурой `{x, animated}`,
  поэтому прокрутка идёт через `Element.prototype.scrollTo.call(...)`.
- Меток нет или вёрстка другая - плагин ничего не делает, лента остаётся родной. Один экземпляр на окно,
  даже если плагин загружен несколькими хостами.

Проверка (`docs/verification-0.1.0.md`): тестовый демон
`paseo daemon run --home /Users/agmazin/Library/Developer/paseo-tabs/test-home` на 127.0.0.1:6793,
`node_modules` - симлинк на `/Users/agmazin/Library/Developer/paseo-tabs/node_modules`.
- `npm run typecheck`, `npm test`;
- `node tests/browser/live.mjs`, `node tests/browser/drag-compact.mjs`, `node tests/browser/shots.mjs docs/shots/0.1.0`;
- `node tests/browser/subagents.mjs docs/shots/0.2.0` - нужен чат "Индикатор подагентов" с работающими подагентами
  (подагенты Claude не держат долгий `sleep`, берите Codex: `paseo run --provider codex --mode full-access`).

Макеты (до выбора варианта): `prototype/live.html`, снимки `prototype/shots/`, перерисовать - `prototype/shots.sh`.

Основной Paseo грузит плагин из клона по тегу: `/Users/agmazin/Library/Developer/paseo-releases/paseo-tabs`
(`node_modules` - симлинк на `/Users/agmazin/Library/Developer/paseo-tabs/node_modules`). Обновление и откат:

```sh
git -C /Users/agmazin/Library/Developer/paseo-releases/paseo-tabs fetch --tags
git -C /Users/agmazin/Library/Developer/paseo-releases/paseo-tabs checkout vX.Y.Z
paseo plugin reload paseo-tabs
paseo plugin ls
```

Быстро выключить: `paseo plugin disable paseo-tabs`. Демон не перезапускать.
