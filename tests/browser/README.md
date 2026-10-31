# Живые проверки

Для выпуска 0.4.0 используются только:

- `setup-close-fixtures.mjs` - idle root/root/child без отправки промптов;
- `close-choice-baseline.mjs` - репродукция ошибки 0.3.2 на исходном клиенте;
- `close-choice.mjs` - матрица native, plugin, combined;
- `close-choice-edges.mjs` - задержка и недоступность discovery;
- `choice-host.cjs` - скрытый fixture-only Electron, порт 6812.

Остальные close/recovery/desktop-race сценарии сохранены как исторические проверки
выпусков 0.3.x. Их ожидание немедленного закрытия без диалога отменено в 0.4.0.
Не запускать их как приёмку текущего выпуска.

Полный порядок и границы безопасности: `docs/verification-0.4.0.md` в корне проекта.
