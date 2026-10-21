# Paseo "Вкладки"

Плагин Paseo: навигация по вкладкам рабочего пространства, когда их много (15-20 и больше).

Состояние на 21.10.2026: Александр выбрал вариант Б (листалка и список). Версия 0.1.0 написана и проверена
на тестовом демоне, ждёт его приёмки; в основной Paseo не ставилась. Задание - `docs/source/2026-10-21-task.md`.

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
  Лента в правой панели (Файлы, Изменения) не трогается.
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

Установка в основной Paseo - только после приёмки Александра: тег принятой версии, клон
`/Users/agmazin/Library/Developer/paseo-releases/paseo-tabs`, `paseo plugin install` из клона (как Диалоги и Лимиты).
