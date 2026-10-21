# Paseo "Вкладки"

Плагин Paseo: навигация по вкладкам рабочего пространства, когда их много (15-20 и больше).

Состояние на 21.10.2026: Александр выбрал вариант Б (листалка и список). 0.1.0 поставлена в основной Paseo
по его "ставим" из клона `/Users/agmazin/Library/Developer/paseo-releases/paseo-tabs`, он тестирует на живом;
0.1.1 - правая панель (Файлы, Изменения, панели плагинов) больше не получает кнопку списка.
Задание - `docs/source/2026-10-21-task.md`.

Что делает 0.1.0 (только веб и настольное приложение, на телефоне ничего):
- вкладки не сжимаются до 64 px: ширина по названию, до 160 px (родной максимум), лишнее уходит в прокрутку;
- обычное колесо мыши листает ленту; тачпад работает как раньше;
- лента сама доезжает до открытой вкладки (переключение клавишами, из "Диалогов", из списка);
- по краям счётчики спрятанных вкладок, клик листает на экран; метка самого важного статуса за краем:
  "!" ждёт ввода, красная - ошибка, зелёная - закончил и не прочитан;
- кнопка со счётчиком после ленты: список всех вкладок по порядку, поиск (без учёта регистра и ё),
  ↑↓ Enter Esc, родные статусы и подсказки родных клавиш перехода.

Устройство:
- `client/web.ts` - весь DOM, только под `Platform.OS === "web"`; `shared/model.ts` - чистая логика, тесты
  `tests/model.test.mts`; `index.client.ts` - точка входа, сервера нет.
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
- `node tests/browser/live.mjs`, `node tests/browser/drag-compact.mjs`, `node tests/browser/shots.mjs docs/shots/0.1.0`.

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
