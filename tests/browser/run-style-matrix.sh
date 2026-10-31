set -e
for task_mode in ${CLOSE_MATRIX_MODES:-native plugin combined hot-upgrade}; do
  if [ "$task_mode" = native ] || [ "$task_mode" = hot-upgrade ]; then
    paseo plugin disable paseo-tabs --host 127.0.0.1:6812 > .fixture/plugin-state.log
  else
    if [ "$task_mode" = plugin ]; then
      paseo plugin enable paseo-tabs --host 127.0.0.1:6812 > .fixture/plugin-state.log
    fi
    paseo plugin reload paseo-tabs --host 127.0.0.1:6812 > .fixture/plugin-state.log
  fi
  if [ "$task_mode" = plugin ]; then
    cp .fixture/backups/e34d305be181eda51066d03f7d1516b4603cc4661643e1ca3d818f2bba3e7363.js .fixture/app-dist/_expo/static/js/web/index-4df2750168de94b9b8fdf3170859afa9.js
    cp .fixture/backups/e43e6f3cb52d9affede68829baf465cc25d36692e720aa0ee57858637780316f.html .fixture/app-dist/index.html
  else
    cp .fixture/backups/80161ccff233ffc308473699ed096d9a228d2f215f085665571d48ba50701a8f.js .fixture/app-dist/_expo/static/js/web/index-4df2750168de94b9b8fdf3170859afa9.js
    cp .fixture/backups/738f1a9a437b7dcce8b272b787e8fe2f2a6f0d81ab9b0ec996da8e3012efe484.html .fixture/app-dist/index.html
    if [ "$task_mode" != hot-upgrade ]; then
      node --experimental-strip-types scripts/native-close-patch.mts apply "$PWD/.fixture/app-dist" "$PWD/.fixture/backups" > .fixture/patch.log
    fi
  fi
  CLOSE_FIXTURE_BASE="$PWD/.fixture" node tests/browser/setup-close-fixtures.mjs
  CLOSE_FIXTURE_BASE="$PWD/.fixture" CLOSE_MODE="$task_mode" CLOSE_PROFILE="matrix-final-$task_mode-$$" node tests/browser/close-choice.mjs > ".fixture/matrix-$task_mode.log" 2>&1
  echo "$task_mode passed"
done
